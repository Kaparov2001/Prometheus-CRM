package handlers

import (
	"fmt"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListClassesHandler возвращает список классов.
// Поддерживает пагинацию и может вернуть все классы, если передан параметр `?all=true`.
func ListClassesHandler(c *gin.Context) {
	var classes []models.ClassResponse

	// ✅ ИСПРАВЛЕНИЕ: Создаем временную структуру для корректного сканирования из БД.
	// GORM не может напрямую сканировать агрегированную строку в срез (`[]string`).
	type rawClassResult struct {
		ID           uint
		GradeNumber  int
		LiterChar    string
		Language     string
		StudyType    string
		StudentCount int
		Teachers     string // Сканируем результат string_agg как простую строку
	}
	var rawResults []rawClassResult

	query := config.DB.Table("classes c").
		Select(`
            c.id, c.grade_number, COALESCE(cl.liter_char, '?') as liter_char,
            c.language, c.study_type,
            (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.deleted_at IS NULL) as student_count,
            COALESCE(
                (SELECT string_agg(u.full_name, ', ')
                 FROM class_assignments ca
                 JOIN users u ON ca.user_id = u.id
                 WHERE ca.class_id = c.id),
                'Не назначен'
            ) as teachers
        `).
		Joins("LEFT JOIN class_liters cl ON c.liter_id = cl.id").
		Order("c.grade_number, cl.liter_char")

	if c.Query("all") == "true" {
		if err := query.Scan(&rawResults).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении полного списка классов: " + err.Error()})
			return
		}
	} else {
		var totalRows int64
		config.DB.Model(&models.Class{}).Count(&totalRows)

		paginatedQuery := query.Scopes(Paginate(c))
		if err := paginatedQuery.Scan(&rawResults).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении данных о классах: " + err.Error()})
			return
		}
	}

	// ✅ ИСПРАВЛЕНИЕ: Преобразуем "сырые" результаты в финальную структуру ответа.
	for _, raw := range rawResults {
		class := models.ClassResponse{
			ID:           raw.ID,
			GradeNumber:  raw.GradeNumber,
			LiterChar:    raw.LiterChar,
			Language:     raw.Language,
			StudyType:    raw.StudyType,
			StudentCount: raw.StudentCount,
			Teachers:     strings.Split(raw.Teachers, ", "), // Теперь мы вручную разделяем строку на срез
		}
		classes = append(classes, class)
	}

	if classes == nil {
		classes = make([]models.ClassResponse, 0)
	}

	// Отправляем ответ в зависимости от того, был ли запрошен полный список
	if c.Query("all") == "true" {
		c.JSON(http.StatusOK, classes)
	} else {
		var totalRows int64
		config.DB.Model(&models.Class{}).Count(&totalRows)
		paginatedResponse := CreatePaginatedResponse(c, classes, totalRows)
		c.JSON(http.StatusOK, paginatedResponse)
	}
}

// CreateClassHandler для создания нового класса
func CreateClassHandler(c *gin.Context) {
	var input models.ClassInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var liter models.ClassLiter
		if err := tx.Where(models.ClassLiter{LiterChar: input.LiterChar}).FirstOrCreate(&liter).Error; err != nil {
			return err
		}

		newClass := models.Class{
			GradeNumber: input.GradeNumber,
			LiterID:     int(liter.ID),
			Language:    input.Language,
			StudyType:   input.StudyType,
		}

		if err := tx.Create(&newClass).Error; err != nil {
			return err
		}

		if len(input.Assignments) > 0 {
			for _, assignmentInput := range input.Assignments {
				assignment := models.ClassAssignment{
					ClassID:     newClass.ID,
					UserID:      assignmentInput.UserID,
					RoleInClass: assignmentInput.RoleInClass,
				}
				if err := tx.Create(&assignment).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать класс: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Класс успешно создан"})
}

// GetClassHandler для получения одного класса по ID
func GetClassHandler(c *gin.Context) {
	id := c.Param("id")

	var class models.Class
	if err := config.DB.First(&class, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Класс не найден"})
		return
	}

	var liter models.ClassLiter
	config.DB.First(&liter, class.LiterID)

	var assignments []models.ClassAssignment
	config.DB.Where("class_id = ?", id).Find(&assignments)

	response := gin.H{
		"id":           class.ID,
		"grade_number": class.GradeNumber,
		"liter_char":   liter.LiterChar,
		"language":     class.Language,
		"study_type":   class.StudyType,
		"assignments":  assignments,
	}

	c.JSON(http.StatusOK, response)
}

// UpdateClassHandler для обновления класса
func UpdateClassHandler(c *gin.Context) {
	id := c.Param("id")
	var input models.ClassInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var class models.Class
		if err := tx.First(&class, id).Error; err != nil {
			return fmt.Errorf("класс с ID %s не найден", id)
		}

		var liter models.ClassLiter
		if err := tx.Where(models.ClassLiter{LiterChar: input.LiterChar}).FirstOrCreate(&liter).Error; err != nil {
			return err
		}

		updateData := models.Class{
			GradeNumber: input.GradeNumber,
			LiterID:     int(liter.ID),
			Language:    input.Language,
			StudyType:   input.StudyType,
		}
		if err := tx.Model(&class).Updates(updateData).Error; err != nil {
			return err
		}

		if err := tx.Where("class_id = ?", id).Delete(&models.ClassAssignment{}).Error; err != nil {
			return err
		}

		for _, assignmentInput := range input.Assignments {
			newAssignment := models.ClassAssignment{
				ClassID:     class.ID,
				UserID:      assignmentInput.UserID,
				RoleInClass: assignmentInput.RoleInClass,
			}
			if err := tx.Create(&newAssignment).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить класс: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Класс успешно обновлен"})
}

// DeleteClassHandler для удаления класса
func DeleteClassHandler(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}

	var studentCount int64
	config.DB.Model(&models.Student{}).Where("class_id = ?", id).Count(&studentCount)
	if studentCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Нельзя удалить класс, в нем есть %d учеников.", studentCount)})
		return
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("class_id = ?", id).Delete(&models.ClassAssignment{}).Error; err != nil {
			return err
		}
		if result := tx.Delete(&models.Class{}, id); result.Error != nil {
			return result.Error
		} else if result.RowsAffected == 0 {
			return fmt.Errorf("класс не найден")
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось удалить класс: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Класс успешно удален"})
}
