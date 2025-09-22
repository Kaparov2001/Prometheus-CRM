package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"gorm.io/gorm"
)

// --- НОВАЯ, УЛУЧШЕННАЯ ФУНКЦИЯ ---
// extractJSON находит первую валидную и полную JSON-структуру в строке.
// Новая версия умеет "вырезать" JSON из markdown-блоков (```json ... ```)
// и другого текстового "мусора" от ИИ.
func extractJSON(raw string) string {
	// Сначала ищем JSON внутри markdown-блока ```json
	if jsonBlockStart := strings.Index(raw, "```json"); jsonBlockStart != -1 {
		raw = raw[jsonBlockStart+7:] // Пропускаем "```json"
		if jsonBlockEnd := strings.Index(raw, "```"); jsonBlockEnd != -1 {
			raw = raw[:jsonBlockEnd]
		}
	} else if blockStart := strings.Index(raw, "```"); blockStart != -1 {
		// Если нет "```json", ищем обычный "```"
		raw = raw[blockStart+3:]
		if blockEnd := strings.Index(raw, "```"); blockEnd != -1 {
			raw = raw[:blockEnd]
		}
	}

	// Теперь в очищенной строке ищем сам JSON
	start := strings.Index(raw, "{")
	if start == -1 {
		return ""
	}

	end := strings.LastIndex(raw, "}")
	if end == -1 || end < start {
		return ""
	}

	potentialJSON := raw[start : end+1]

	if json.Valid([]byte(potentialJSON)) {
		return potentialJSON
	}

	slog.Warn("AI response contained a malformed or incomplete JSON object.", "snippet", potentialJSON)
	return ""
}

// CreateOrUpdateScheduleHandler находит расписание и обновляет или создает его.
func CreateOrUpdateScheduleHandler(c *gin.Context) {
	var schedule models.Schedule
	if err := c.ShouldBindJSON(&schedule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	db := config.DB
	var existingSchedule models.Schedule

	err := db.Where("class_id = ? AND academic_year = ? AND quarter = ?", schedule.ClassID, schedule.AcademicYear, schedule.Quarter).First(&existingSchedule).Error

	switch {
	case err == nil: // Расписание найдено, обновляем его
		existingSchedule.ScheduleData = schedule.ScheduleData
		if err := db.Save(&existingSchedule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update schedule"})
			return
		}
		c.JSON(http.StatusOK, existingSchedule)
	case errors.Is(err, gorm.ErrRecordNotFound): // Расписание не найдено, создаем новое
		if err := db.Create(&schedule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create schedule"})
			return
		}
		c.JSON(http.StatusCreated, schedule)
	default: // Другая ошибка базы данных
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
	}
}

// GetScheduleHandler обрабатывает запрос на получение расписания.
func GetScheduleHandler(c *gin.Context) {
	classIDStr := c.Query("class_id")
	academicYear := c.Query("academic_year")
	quarterStr := c.Query("quarter")

	if classIDStr == "" || academicYear == "" || quarterStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required query parameters"})
		return
	}

	classID, _ := strconv.Atoi(classIDStr)
	quarter, _ := strconv.Atoi(quarterStr)

	db := config.DB
	var schedule models.Schedule

	err := db.Where("class_id = ? AND academic_year = ? AND quarter = ?", classID, academicYear, quarter).First(&schedule).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			slog.Info("No schedule found", "class", classID, "year", academicYear, "quarter", quarter)
			c.JSON(http.StatusOK, gin.H{}) // Возвращаем пустой объект, если расписание не найдено
			return
		}
		slog.Error("Database error fetching schedule", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, schedule)
}

// GenerateScheduleAIHandler обрабатывает запрос на генерацию расписания с помощью ИИ.
func GenerateScheduleAIHandler(c *gin.Context) {
	classIDStr := c.Query("class_id")
	if classIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing class_id parameter"})
		return
	}
	classID, err := strconv.Atoi(classIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid class_id parameter"})
		return
	}

	var class models.Class
	if err := config.DB.First(&class, classID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Class not found"})
		return
	}

	var subjects []models.Subject
	if err := config.DB.Find(&subjects).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load subjects"})
		return
	}

	prompt := constructAIPrompt(class.GradeNumber, subjects)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	iter := config.GeminiClient.GenerateContentStream(ctx, genai.Text(prompt))
	var fullResponse strings.Builder

	for {
		resp, err := iter.Next()
		if err != nil {
			if errors.Is(err, io.EOF) || strings.Contains(err.Error(), "no more items in iterator") {
				break
			}
			slog.Error("Error during AI stream", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stream schedule from AI"})
			return
		}
		if resp != nil && len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			for _, part := range resp.Candidates[0].Content.Parts {
				if txt, ok := part.(genai.Text); ok {
					fullResponse.WriteString(string(txt))
				}
			}
		}
	}

	// --- НАЧАЛО БЛОКА ИЗМЕНЕНИЙ ---
	// 1. Используем улучшенную функцию для извлечения "чистого" JSON.
	cleanJSON := extractJSON(fullResponse.String())

	// 2. Проверяем, не пустой ли результат. Если да - возвращаем ошибку.
	if cleanJSON == "" {
		slog.Error("AI returned invalid or incomplete data (no valid JSON found)", "response", fullResponse.String())
		// Даем фронтенду понятную ошибку
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ИИ вернул некорректные данные. Попробуйте снова."})
		return
	}

	var scheduleDataFromAI map[string][]struct {
		LessonNumber int    `json:"lesson_number"`
		SubjectName  string `json:"subject_name"`
	}

	if err := json.Unmarshal([]byte(cleanJSON), &scheduleDataFromAI); err != nil {
		slog.Error("Failed to parse extracted JSON from AI", "json", cleanJSON, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse the schedule data from AI"})
		return
	}

	// 3. Дополнительная проверка: если ИИ вернул валидный, но пустой JSON (например, "{}").
	if len(scheduleDataFromAI) == 0 {
		slog.Warn("AI JSON was valid but resulted in an empty schedule.", "json", cleanJSON)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ИИ сгенерировал пустое расписание. Попробуйте снова."})
		return
	}
	// --- КОНЕЦ БЛОКА ИЗМЕНЕНИЙ ---

	// Ваша логика по преобразованию ответа ИИ в нужный формат остается без изменений.
	finalSchedule := make(map[string][]map[string]interface{})
	subjectsMap := make(map[string]uint)
	for _, s := range subjects {
		subjectsMap[s.Name] = s.ID
	}

	for day, lessons := range scheduleDataFromAI {
		var lessonList []map[string]interface{}
		for _, l := range lessons {
			subjectID, found := subjectsMap[l.SubjectName]
			if !found {
				slog.Warn("AI generated a subject that does not exist in the database", "subjectName", l.SubjectName)
				continue
			}

			lessonList = append(lessonList, map[string]interface{}{
				"lesson_number": l.LessonNumber,
				"subject_id":    subjectID,
				"subject_name":  l.SubjectName,
			})
		}
		// Добавляем день только если в нем есть хотя бы один валидный урок
		if len(lessonList) > 0 {
			finalSchedule[day] = lessonList
		}
	}

	// Еще одна проверка: если после фильтрации несуществующих предметов расписание стало пустым.
	if len(finalSchedule) == 0 {
		slog.Warn("The final schedule is empty after filtering out non-existent subjects.", "ai_response", cleanJSON)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ИИ не смог составить расписание из доступных предметов. Проверьте список."})
		return
	}

	c.JSON(http.StatusOK, finalSchedule)
}

// constructAIPrompt создает детальное и строгое задание для ИИ.
func constructAIPrompt(gradeNumber int, availableSubjects []models.Subject) string {
	var subjectNames []string
	for _, s := range availableSubjects {
		// Заключаем каждое название в кавычки, чтобы ИИ понял, что это точные строки
		subjectNames = append(subjectNames, `"`+s.Name+`"`)
	}
	subjectsString := strings.Join(subjectNames, ", ")

	return fmt.Sprintf(`
	**Критически важная задача**: Сгенерируй школьное расписание для %d класса в формате JSON.

	**Строгие правила**:
	1.  **Только JSON**: Твой ответ должен быть ИСКЛЮЧИТЕЛЬНО валидным JSON объектом. Никакого текста до или после JSON, никаких markdown-блоков ('''json ... '''), никаких комментариев.
	2.  **Дни недели**: Используй только следующие ключи для дней: "Понедельник", "Вторник", "Среда", "Четверг", "Пятница".
	3.  **Количество уроков**: В каждом дне должно быть от 5 до 7 уроков.
	4.  **Список предметов**: В поле "subject_name" можно использовать **ТОЛЬКО** и **В ТОЧНОСТИ** строки из этого списка: [%s].
		* **ЗАПРЕЩЕНО**: Сокращать названия (например, "Физ-ра" вместо "Физкультура").
		* **ЗАПРЕЩЕНО**: Придумывать предметы, которых нет в списке.
		* **ЗАПРЕЩЕНО**: Использовать синонимы или предметы в другом падеже. Названия должны быть скопированы один в один.
	5.  **Сбалансированность**: Распредели предметы равномерно в течение недели. Сложные предметы (Алгебра, Геометрия, Физика, Химия) не ставь первыми или последними уроками. Физкультуру лучше ставить в середине дня.
	6.  **Валидность**: Убедись, что JSON синтаксически корректен и не обрывается.

	**Требуемая структура JSON**:
	{
	  "Понедельник": [
		{ "lesson_number": 1, "subject_name": "Точное название из списка" },
		{ "lesson_number": 2, "subject_name": "Точное название из списка" }
	  ],
	  "Вторник": [
	  ]
	}
	`, gradeNumber, subjectsString)
}
