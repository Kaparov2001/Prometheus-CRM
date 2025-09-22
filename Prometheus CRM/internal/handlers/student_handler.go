// prometheus-crm/internal/handlers/student_handler.go
package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StudentHandler инкапсулирует зависимости, такие как подключение к базе данных.
type StudentHandler struct {
	DB *gorm.DB
}

// NewStudentHandler создает новый экземпляр StudentHandler.
func NewStudentHandler(db *gorm.DB) *StudentHandler {
	return &StudentHandler{DB: db}
}

// --- Структуры для входящих данных и ответов по СТУДЕНТАМ ---

type StudentListResponse struct {
	ID         uint   `json:"ID"`
	LastName   string `json:"lastName"`
	FirstName  string `json:"firstName"`
	Grade      string `json:"grade"`
	Liter      string `json:"liter"`
	IsStudying bool   `json:"isStudying"`
	PhotoURL   string `json:"photoUrl"`
}

type StudentDetailResponse struct {
	models.Student
	FamilyMembers []FamilyMemberResponse `json:"familyMembers"`
}

type FamilyMemberResponse struct {
	models.Student
	Discount float64 `json:"discount"`
	IsSelf   bool    `json:"isSelf"`
	LinkID   uint    `json:"linkId"`
}

// --- Обработчики для СТУДЕНТА ---

func ListStudentsHandler(c *gin.Context) {
	var students []StudentListResponse
	var totalRows int64

	baseQuery := config.DB.Table("students").
		Select(`
            students.id,
            students.last_name,
            students.first_name,
            students.photo_url,
            COALESCE(classes.grade_number::text, '') as grade,
            COALESCE(class_liters.liter_char, '') as liter,
            COALESCE(students.is_studying, TRUE) as is_studying
        `).
		Joins("LEFT JOIN classes ON students.class_id = classes.id").
		Joins("LEFT JOIN class_liters ON classes.liter_id = class_liters.id").
		Where("students.deleted_at IS NULL")

	searchQuery := c.Query("search")
	if searchQuery != "" {
		searchPattern := "%" + strings.ToLower(searchQuery) + "%"
		baseQuery = baseQuery.Where(
			"LOWER(students.last_name) LIKE ? OR LOWER(students.first_name) LIKE ? OR LOWER(students.iin) LIKE ?",
			searchPattern, searchPattern, searchPattern,
		)
	}

	// +++ НАЧАЛО ИЗМЕНЕНИЙ +++
	// Добавляем фильтрацию по ID класса, если параметр передан в запросе
	if classIDStr := c.Query("class_id"); classIDStr != "" {
		classID, err := strconv.Atoi(classIDStr)
		if err == nil {
			baseQuery = baseQuery.Where("students.class_id = ?", classID)
		}
	}
	// +++ КОНЕЦ ИЗМЕНЕНИЙ +++

	if c.Query("all") == "true" {
		if err := baseQuery.Order("students.last_name, students.first_name").Scan(&students).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить список учеников"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": students})
		return
	}

	countQuery := baseQuery
	if err := countQuery.Model(&models.Student{}).Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось посчитать учеников"})
		return
	}

	paginatedQuery := baseQuery.Scopes(Paginate(c)).Order("students.last_name, students.first_name")
	if err := paginatedQuery.Scan(&students).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить список учеников"})
		return
	}

	if students == nil {
		students = make([]StudentListResponse, 0)
	}

	paginatedResponse := CreatePaginatedResponse(c, students, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

func GetStudentHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID ученика"})
		return
	}

	var student models.Student
	if err := config.DB.First(&student, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ученик не найден"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения данных ученика: " + err.Error()})
		return
	}

	familyIDs, err := findFullFamily(config.DB, uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось найти семью: " + err.Error()})
		return
	}

	var familyStudents []models.Student
	if err := config.DB.Where("id IN ?", familyIDs).Find(&familyStudents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось загрузить членов семьи: " + err.Error()})
		return
	}

	// Сортируем семью по `family_order` для корректного отображения и расчета скидок "на лету"
	sort.SliceStable(familyStudents, func(i, j int) bool {
		return familyStudents[i].FamilyOrder < familyStudents[j].FamilyOrder
	})

	familyMembersResponse := []FamilyMemberResponse{}
	for i, member := range familyStudents {
		var discount float64

		// --- ИСПРАВЛЕНИЕ 1: Расчет скидки в реальном времени ---
		// Эта логика теперь всегда показывает правильную скидку в карточке,
		// основываясь на текущем порядке детей в семье.
		// Важно: этот расчет предназначен только для отображения на странице.
		// Фактическое обновление скидки в договоре происходит в фоновой задаче UpdateFamilyDiscounts.
		switch i {
		case 0: // Первый ребенок
			discount = 0.0
		case 1: // Второй ребенок
			discount = 5.0
		default: // Третий и последующие
			discount = 10.0
		}

		if member.PhotoURL == "" {
			member.PhotoURL = "/static/placeholder.png"
		}

		var link models.FamilyLink
		var linkID uint = 0
		if student.ID != member.ID {
			// Находим ID самой связи, чтобы на фронтенде можно было отправить запрос на удаление именно этой связи
			if err := config.DB.Where("(student_id = ? AND relative_id = ?)", student.ID, member.ID).First(&link).Error; err == nil {
				linkID = link.ID
			}
		}

		familyMembersResponse = append(familyMembersResponse, FamilyMemberResponse{
			Student:  member,
			Discount: discount,
			IsSelf:   member.ID == uint(id),
			LinkID:   linkID,
		})
	}

	if student.PhotoURL == "" {
		student.PhotoURL = "/static/placeholder.png"
	}

	response := StudentDetailResponse{
		Student:       student,
		FamilyMembers: familyMembersResponse,
	}

	c.JSON(http.StatusOK, response)
}

func CreateStudentHandler(c *gin.Context) {
	var student models.Student
	if err := bindStudentFormData(c, &student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Проверка на уникальность ИИН перед созданием
	if student.IIN != "" {
		var existingStudent models.Student
		if err := config.DB.Where("iin = ? AND deleted_at IS NULL", student.IIN).First(&existingStudent).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Ученик с таким ИИН уже существует."})
			return
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка проверки ИИН: " + err.Error()})
			return
		}
	}

	// Устанавливаем `family_order` по умолчанию. 999 означает "одиночка".
	student.FamilyOrder = 999

	tx := config.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Create(&student).Error; err != nil {
		tx.Rollback()
		if strings.Contains(err.Error(), "idx_students_iin_unique_when_not_deleted") {
			c.JSON(http.StatusConflict, gin.H{"error": "Ученик с таким ИИН уже существует."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать ученика: " + err.Error()})
		}
		return
	}

	// Обработка загрузки фото
	file, _ := c.FormFile("photo")
	if file != nil {
		photoURL, err := saveUploadedFile(c, fmt.Sprintf("static/uploads/students/%d", student.ID), "photo")
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить фото: " + err.Error()})
			return
		}
		student.PhotoURL = photoURL
		if err := tx.Save(&student).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить фото ученика: " + err.Error()})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка транзакции."})
		return
	}

	c.JSON(http.StatusCreated, student)
}

func UpdateStudentHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID ученика"})
		return
	}
	studentID := uint(id)

	var student models.Student
	if err := config.DB.First(&student, studentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ученик не найден"})
		return
	}

	oldIIN := student.IIN

	if err := bindStudentFormData(c, &student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Проверка на уникальность ИИН, если он был изменен
	if student.IIN != "" && student.IIN != oldIIN {
		var existingStudent models.Student
		if err := config.DB.Where("iin = ? AND id != ? AND deleted_at IS NULL", student.IIN, studentID).First(&existingStudent).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Другой ученик с таким ИИН уже существует."})
			return
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка проверки ИИН."})
			return
		}
	}

	file, _ := c.FormFile("photo")
	if file != nil {
		photoURL, err := saveUploadedFile(c, fmt.Sprintf("static/uploads/students/%d", student.ID), "photo")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить фото: " + err.Error()})
			return
		}
		student.PhotoURL = photoURL
	}

	if err := config.DB.Save(&student).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить ученика: " + err.Error()})
		return
	}

	// После обновления данных ученика (например, даты рождения), запускаем пересчет скидок для его семьи.
	// Это гарантирует, что порядок в семье и скидки будут пересчитаны, если это необходимо.
	go UpdateFamilyDiscounts([]uint{studentID})

	c.JSON(http.StatusOK, student)
}

// --- НОВЫЙ ИСПРАВЛЕННЫЙ КОД ---
func DeleteStudentHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID ученика"})
		return
	}
	studentID := uint(id)

	var familyToUpdate []uint

	// Используем транзакцию для безопасного удаления
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// 1. Находим всех членов семьи ДО удаления студента.
		familyIDs, err := findFullFamily(tx, studentID)
		if err != nil {
			return fmt.Errorf("не удалось найти семью для обновления: %w", err)
		}

		// 2. Сохраняем ID оставшихся членов семьи для последующего обновления скидок.
		for _, memberID := range familyIDs {
			if memberID != studentID {
				familyToUpdate = append(familyToUpdate, memberID)
			}
		}

		// 3. Удаляем все родственные связи, где участвует этот студент.
		if err := tx.Where("student_id = ? OR relative_id = ?", studentID, studentID).Delete(&models.FamilyLink{}).Error; err != nil {
			return fmt.Errorf("не удалось удалить родственные связи: %w", err)
		}

		// 4. Удаляем самого студента (мягкое удаление).
		if err := tx.Delete(&models.Student{}, studentID).Error; err != nil {
			return fmt.Errorf("не удалось удалить ученика: %w", err)
		}

		// Если все прошло успешно, транзакция будет закоммичена.
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 5. Если после удаления остались члены семьи, запускаем для них пересчет скидок.
	if len(familyToUpdate) > 0 {
		go UpdateFamilyDiscounts(familyToUpdate)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Ученик успешно удален, скидки для семьи обновляются"})
}

// --- ОБРАБОТЧИКИ РОДСТВЕННИКОВ ---

func AddFamilyLinkHandler(c *gin.Context) {
	studentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid student ID"})
		return
	}

	var input struct {
		RelativeID uint `json:"relativeId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	if uint(studentID) == input.RelativeID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Student cannot be a relative to themselves"})
		return
	}

	var allFamilyIDs []uint
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// Находим семьи обоих учеников
		family1IDs, err := findFullFamily(tx, uint(studentID))
		if err != nil {
			return err
		}
		family2IDs, err := findFullFamily(tx, input.RelativeID)
		if err != nil {
			return err
		}

		// Объединяем их в одну большую семью, удаляя дубликаты
		idMap := make(map[uint]bool)
		for _, id := range family1IDs {
			idMap[id] = true
		}
		for _, id := range family2IDs {
			idMap[id] = true
		}

		allFamilyIDs = []uint{}
		for id := range idMap {
			allFamilyIDs = append(allFamilyIDs, id)
		}

		var allFamilyStudents []models.Student
		if err := tx.Where("id IN ?", allFamilyIDs).Find(&allFamilyStudents).Error; err != nil {
			return err
		}

		// Сортируем объединенную семью по дате рождения, чтобы определить порядок детей
		sort.SliceStable(allFamilyStudents, func(i, j int) bool {
			ai, aj := allFamilyStudents[i], allFamilyStudents[j]
			if ai.BirthDate == nil && aj.BirthDate == nil {
				return ai.CreatedAt.Before(aj.CreatedAt) // Tie-breaker
			}
			if ai.BirthDate == nil {
				return false // Считаем, что без даты рождения "младше"
			}
			if aj.BirthDate == nil {
				return true
			}
			if ai.BirthDate.Equal(*aj.BirthDate) {
				return ai.CreatedAt.Before(aj.CreatedAt) // Tie-breaker
			}
			return ai.BirthDate.Before(*aj.BirthDate) // Старшие (раньше родились) идут первыми
		})

		// Обновляем `family_order` для каждого члена новой большой семьи
		for i, student := range allFamilyStudents {
			if err := tx.Model(&student).Update("family_order", i).Error; err != nil {
				return err
			}
		}

		// Создаем полные связи "каждый с каждым" внутри новой семьи
		for i := 0; i < len(allFamilyIDs); i++ {
			for j := i + 1; j < len(allFamilyIDs); j++ {
				linksToUpsert := []models.FamilyLink{
					{StudentID: allFamilyIDs[i], RelativeID: allFamilyIDs[j]},
					{StudentID: allFamilyIDs[j], RelativeID: allFamilyIDs[i]},
				}
				// Используем OnConflict, чтобы избежать ошибок дублирования и восстановить, если связь была удалена ранее
				err := tx.Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "student_id"}, {Name: "relative_id"}},
					DoUpdates: clause.Assignments(map[string]interface{}{"deleted_at": nil}),
				}).Create(&linksToUpsert).Error
				if err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to merge families: " + err.Error()})
		return
	}

	// Запускаем фоновое обновление скидок для всей объединенной семьи
	go UpdateFamilyDiscounts(allFamilyIDs)

	c.JSON(http.StatusOK, gin.H{"message": "Family link created and order updated successfully"})
}

// --- ИСПРАВЛЕНИЕ 2: Полностью переработанная функция удаления ---
func RemoveFamilyLinkHandler(c *gin.Context) {
	// Параметр в URL - это ID самой связи (из таблицы family_links), а не ID родственника.
	// Переименовываем переменную для ясности.
	linkID, err := strconv.Atoi(c.Param("relativeId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID связи"})
		return
	}

	var linkToDelete models.FamilyLink
	// 1. Находим саму связь по её ID, чтобы узнать ID обоих учеников.
	if err := config.DB.First(&linkToDelete, linkID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Родственная связь не найдена"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при поиске родственной связи"})
		return
	}

	// 2. Получаем ID обоих учеников из найденной связи.
	studentA := linkToDelete.StudentID
	studentB := linkToDelete.RelativeID

	var familyBeforeDeletion []uint
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// 3. Находим всех членов семьи ДО удаления, чтобы потом пересчитать им скидки.
		family, err := findFullFamily(tx, studentA)
		if err != nil {
			return err
		}
		familyBeforeDeletion = family

		// 4. Удаляем обе "стороны" связи: от А к Б и от Б к А.
		if err := tx.Where("(student_id = ? AND relative_id = ?) OR (student_id = ? AND relative_id = ?)",
			studentA, studentB, studentB, studentA).Delete(&models.FamilyLink{}).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось удалить родственные связи: " + err.Error()})
		return
	}

	// 5. Запускаем фоновые задачи для обновления скидок и порядка в семье.
	// Обновляем скидки для всей семьи, которая была до разрыва связи.
	go UpdateFamilyDiscounts(familyBeforeDeletion)
	// Сбрасываем порядок для "осиротевшего" ученика, если он остался один.
	go resetFamilyOrderForOrphans(studentA)
	go resetFamilyOrderForOrphans(studentB)

	c.JSON(http.StatusOK, gin.H{"message": "Родственник успешно удален"})
}

func UpdateFamilyOrderHandler(c *gin.Context) {
	var input []struct {
		StudentID   uint `json:"student_id"`
		FamilyOrder int  `json:"family_order"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input format: " + err.Error()})
		return
	}

	if len(input) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No order data to update"})
		return
	}

	var studentIDs []uint
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range input {
			result := tx.Model(&models.Student{}).Where("id = ?", item.StudentID).Update("family_order", item.FamilyOrder)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return fmt.Errorf("student with ID %d not found", item.StudentID)
			}
			studentIDs = append(studentIDs, item.StudentID)
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update family order: " + err.Error()})
		return
	}

	// После ручного изменения порядка, запускаем пересчет скидок
	go UpdateFamilyDiscounts(studentIDs)
	c.JSON(http.StatusOK, gin.H{"message": "Family order updated successfully"})
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// findFullFamily рекурсивно находит всех связанных студентов, начиная с одного ID.
func findFullFamily(tx *gorm.DB, startID uint) ([]uint, error) {
	var familyIDs = make(map[uint]bool)
	var toProcess = []uint{startID}
	familyIDs[startID] = true

	for len(toProcess) > 0 {
		currentID := toProcess[0]
		toProcess = toProcess[1:]

		var relativeIDs []uint
		if err := tx.Model(&models.FamilyLink{}).Where("student_id = ?", currentID).Pluck("relative_id", &relativeIDs).Error; err != nil {
			return nil, err
		}

		for _, relID := range relativeIDs {
			if !familyIDs[relID] {
				familyIDs[relID] = true
				toProcess = append(toProcess, relID)
			}
		}
	}

	var result []uint
	for id := range familyIDs {
		result = append(result, id)
	}
	// Если у студента нет родственников, он сам себе семья.
	if len(result) == 0 {
		return []uint{startID}, nil
	}
	return result, nil
}

// UpdateFamilyDiscounts - ключевая функция для поддержания актуальности скидок.
// Она запускается в фоновом режиме, чтобы не замедлять ответы API.
func UpdateFamilyDiscounts(studentIDs []uint) {
	if len(studentIDs) == 0 {
		return
	}

	// Собираем полную семью, чтобы обработать всех затронутых студентов
	var fullFamilySet = make(map[uint]bool)
	for _, id := range studentIDs {
		// Важно: для поиска семьи используем не транзакционную, а глобальную переменную DB,
		// так как эта функция вызывается асинхронно.
		family, err := findFullFamily(config.DB, id)
		if err == nil {
			for _, memberId := range family {
				fullFamilySet[memberId] = true
			}
		}
	}

	var allFamilyIDs []uint
	for id := range fullFamilySet {
		allFamilyIDs = append(allFamilyIDs, id)
	}

	slog.Info("Starting discount update for family", "student_ids", allFamilyIDs)
	var students []models.Student
	// Загружаем всех студентов семьи и сортируем их по `family_order`.
	// `created_at` используется как дополнительный критерий для стабильной сортировки.
	if err := config.DB.Where("id IN ?", allFamilyIDs).Order("family_order asc, created_at asc").Find(&students).Error; err != nil {
		slog.Error("Failed to fetch students for discount update", "error", err)
		return
	}

	// Пересчитываем `family_order` и скидки на основе отсортированного списка
	for i, student := range students {
		// Обновляем family_order на случай, если он был некорректным
		if student.FamilyOrder != i {
			config.DB.Model(&student).Update("family_order", i)
		}

		var discount float64
		switch i {
		case 0: // Первый ребенок
			discount = 0.0
		case 1: // Второй ребенок
			discount = 5.0
		default: // Третий и последующие
			discount = 10.0
		}

		var latestContract models.Contract
		err := config.DB.Where("student_id = ? AND deleted_at IS NULL", student.ID).Order("start_date desc, id desc").First(&latestContract).Error

		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue // У ученика нет договора, пропускаем.
		}
		if err != nil {
			slog.Error("Could not find contract for student", "student_id", student.ID, "error", err)
			continue
		}

		// Если скидка в договоре не соответствует правильной, обновляем ее.
		if latestContract.DiscountPercentage != discount {
			newDiscountedAmount := latestContract.TotalAmount * (1 - (discount / 100))
			updates := map[string]interface{}{
				"discount_percentage": discount,
				"discounted_amount":   newDiscountedAmount,
			}
			if err := config.DB.Model(&latestContract).Updates(updates).Error; err != nil {
				slog.Error("Failed to update contract discount", "contract_id", latestContract.ID, "error", err)
			} else {
				slog.Info("Contract discount updated successfully", "student_id", student.ID, "new_discount", discount)
			}
		}
	}
}

// resetFamilyOrderForOrphans проверяет, остался ли студент один после удаления связи,
// и если да, сбрасывает его family_order в состояние "одиночки".
func resetFamilyOrderForOrphans(studentID uint) {
	var count int64
	config.DB.Model(&models.FamilyLink{}).Where("student_id = ? OR relative_id = ?", studentID, studentID).Count(&count)
	if count == 0 {
		config.DB.Model(&models.Student{}).Where("id = ?", studentID).Update("family_order", 999)
	}
}

func bindStudentFormData(c *gin.Context, student *models.Student) error {
	student.LastName = c.PostForm("lastName")
	student.FirstName = c.PostForm("firstName")
	student.MiddleName = c.PostForm("middleName")
	student.IIN = c.PostForm("iin")
	student.Gender = c.PostForm("gender")
	student.StudentPhone = c.PostForm("studentPhone")
	student.Email = c.PostForm("email")
	student.MothersName = c.PostForm("mothersName")
	student.MothersPhone = c.PostForm("mothersPhone")
	student.FathersName = c.PostForm("fathersName")
	student.FathersPhone = c.PostForm("fathersPhone")
	student.Comments = c.PostForm("comments")
	student.Language = c.PostForm("language")
	student.ContractParentName = c.PostForm("contractParentName")
	student.ContractParentIIN = c.PostForm("contractParentIIN")
	student.ContractParentEmail = c.PostForm("contractParentEmail")
	student.ContractParentPhone = c.PostForm("contractParentPhone")
	student.ContractParentDocumentNumber = c.PostForm("contractParentDocumentNumber")
	student.ContractParentDocumentInfo = c.PostForm("contractParentDocumentInfo")
	student.BirthCertificateNumber = c.PostForm("birthCertificateNumber")
	student.BirthCertificateIssueInfo = c.PostForm("birthCertificateIssueInfo")
	student.MothersWorkPlace = c.PostForm("mothersWorkPlace")
	student.FathersWorkPlace = c.PostForm("fathersWorkPlace")
	student.MothersJobTitle = c.PostForm("mothersJobTitle")
	student.FathersJobTitle = c.PostForm("fathersJobTitle")
	student.HomeAddress = c.PostForm("homeAddress")
	student.MedicalInfo = c.PostForm("medicalInfo")

	if familyOrderStr := c.PostForm("familyOrder"); familyOrderStr != "" {
		if val, err := strconv.Atoi(familyOrderStr); err == nil {
			student.FamilyOrder = val
		}
	}

	if classIDStr := c.PostForm("classId"); classIDStr != "" {
		if val, err := strconv.ParseUint(classIDStr, 10, 64); err == nil {
			v := uint(val)
			student.ClassID = &v
		}
	} else {
		student.ClassID = nil
	}
	if nationalityIDStr := c.PostForm("nationalityId"); nationalityIDStr != "" {
		if val, err := strconv.ParseUint(nationalityIDStr, 10, 64); err == nil {
			v := uint(val)
			student.NationalityID = &v
		}
	} else {
		student.NationalityID = nil
	}

	// ИСПРАВЛЕНИЕ: Добавлен блок для парсинга startDate
	if startDateStr := c.PostForm("startDate"); startDateStr != "" {
		if t, err := time.Parse("2006-01-02", startDateStr); err == nil {
			student.StartDate = &t
		}
	} else {
		student.StartDate = nil
	}

	if birthDateStr := c.PostForm("birthDate"); birthDateStr != "" {
		if t, err := time.Parse("2006-01-02", birthDateStr); err == nil {
			student.BirthDate = &t
		}
	} else {
		student.BirthDate = nil
	}
	if contractParentBirthDateStr := c.PostForm("contractParentBirthDate"); contractParentBirthDateStr != "" {
		if t, err := time.Parse("2006-01-02", contractParentBirthDateStr); err == nil {
			student.ContractParentBirthDate = &t
		}
	} else {
		student.ContractParentBirthDate = nil
	}

	isStudyingStr := c.PostForm("isStudying")
	isStudying, err := strconv.ParseBool(isStudyingStr)
	if err == nil {
		student.IsStudying = &isStudying
	} else {
		b := true
		student.IsStudying = &b
	}

	isResidentStr := c.PostForm("isResident")
	isResident, err := strconv.ParseBool(isResidentStr)
	if err == nil {
		student.IsResident = &isResident
	} else {
		b := true
		student.IsResident = &b
	}

	return nil
}

// GetAllStudents возвращает всех студентов одним списком для выбора.
func GetAllStudents(c *gin.Context) {
	var students []struct {
		ID        uint           `json:"id"`
		Name      string         `json:"name"`
		ClassName sql.NullString `json:"class_name"`
	}

	// Используем LEFT JOIN, чтобы студенты без класса тоже отображались
	query := `
        SELECT s.id, s.first_name || ' ' || s.last_name as name, c.name as class_name
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        ORDER BY s.last_name, s.first_name
    `
	rows, err := config.DB.Raw(query).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch students"})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var student struct {
			ID        uint           `json:"id"`
			Name      string         `json:"name"`
			ClassName sql.NullString `json:"class_name"`
		}
		if err := rows.Scan(&student.ID, &student.Name, &student.ClassName); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan student row"})
			return
		}
		students = append(students, student)
	}

	c.JSON(http.StatusOK, students)
}
