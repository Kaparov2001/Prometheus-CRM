// crm/internal/handlers/calendar_handler.go

package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CombinedEvent - это универсальная структура для отправки всех типов событий на фронтенд.
// Она совместима с frontend-библиотекой FullCalendar.
type CombinedEvent struct {
	ID          string    `json:"id"`
	GroupID     string    `json:"groupId,omitempty"` // Для группировки событий, например 'birthdays', 'schedule'
	Title       string    `json:"title"`
	Start       time.Time `json:"start,omitempty"` // Используется для событий с конкретной датой
	End         time.Time `json:"end,omitempty"`
	AllDay      bool      `json:"allDay"`   // true для событий на весь день (дни рождения)
	Editable    bool      `json:"editable"` // false для автоматически генерируемых событий (расписание, дни рождения)
	Color       string    `json:"color,omitempty"`
	Description string    `json:"description,omitempty"`
	Location    string    `json:"location,omitempty"`
	MeetLink    string    `json:"google_meet_link,omitempty"`

	// Поля для повторяющихся событий (учебное расписание)
	DaysOfWeek []int  `json:"daysOfWeek,omitempty"` // [1] for Monday, [2] for Tuesday etc.
	StartTime  string `json:"startTime,omitempty"`  // "HH:MM:SS"
	EndTime    string `json:"endTime,omitempty"`    // "HH:MM:SS"
}

// EventRequest - структура для получения данных при создании/обновлении события.
type EventRequest struct {
	Title          string    `json:"title" binding:"required"`
	Description    string    `json:"description"`
	StartTime      time.Time `json:"start_time" binding:"required"`
	EndTime        time.Time `json:"end_time" binding:"required"`
	Color          string    `json:"color"`
	Location       string    `json:"location"`
	ParticipantIDs []uint    `json:"participant_ids"`
}

// ParticipantStatusRequest - структура для обновления статуса участника.
type ParticipantStatusRequest struct {
	Status string `json:"status" binding:"required"` // "accepted" or "declined"
}

// GetEvents получает все события (личные, расписание, дни рождения) для текущего пользователя.
func GetEvents(c *gin.Context) {
	currentUserID := c.GetUint("user_id")
	if currentUserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var allEvents []CombinedEvent

	// 1. Получаем личные и приглашенные события
	personalEvents, err := fetchUserEvents(currentUserID)
	if err != nil {
		log.Printf("Error fetching user events: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events"})
		return
	}
	allEvents = append(allEvents, personalEvents...)

	// 2. Получаем учебное расписание
	scheduleEvents, err := fetchScheduleEvents(currentUserID)
	if err != nil {
		log.Printf("Error fetching schedule events: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch schedule"})
		return
	}
	allEvents = append(allEvents, scheduleEvents...)

	// 3. Получаем дни рождения
	birthdayEvents, err := fetchBirthdays()
	if err != nil {
		log.Printf("Error fetching birthdays: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch birthdays"})
		return
	}
	allEvents = append(allEvents, birthdayEvents...)

	c.JSON(http.StatusOK, allEvents)
}

// CreateEvent создает новое событие.
func CreateEvent(c *gin.Context) {
	currentUserID := c.GetUint("user_id")

	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var eventID int
		err := tx.Raw(
			`INSERT INTO events (title, description, start_time, end_time, owner_id, color, location)
			 VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
			req.Title, req.Description, req.StartTime, req.EndTime, currentUserID, req.Color, req.Location,
		).Scan(&eventID).Error
		if err != nil {
			return err
		}

		participants := append(req.ParticipantIDs, currentUserID)
		uniqueParticipants := uniqueUint(participants)

		for _, pID := range uniqueParticipants {
			status := "pending"
			if pID == currentUserID {
				status = "accepted"
			}
			if err := tx.Exec(`INSERT INTO event_participants (event_id, user_id, status) VALUES (?, ?, ?)`, eventID, pID, status).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		log.Printf("Transaction failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Event created successfully"})
}

// UpdateEvent обновляет существующее событие.
func UpdateEvent(c *gin.Context) {
	currentUserID := c.GetUint("user_id")
	eventID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	var event models.Event
	if err := config.DB.First(&event, eventID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		return
	}

	if uint(event.OwnerID) != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not the owner of this event"})
		return
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&event).Updates(models.Event{
			Title:       req.Title,
			Description: req.Description,
			StartTime:   req.StartTime,
			EndTime:     req.EndTime,
			Color:       req.Color,
			Location:    req.Location,
		})
		if result.Error != nil {
			return result.Error
		}

		if err := tx.Where("event_id = ? AND user_id != ?", eventID, currentUserID).Delete(&models.EventParticipant{}).Error; err != nil {
			return err
		}

		for _, pID := range req.ParticipantIDs {
			if pID == currentUserID {
				continue
			}
			participant := models.EventParticipant{EventID: eventID, UserID: int(pID), Status: "pending"}
			if err := tx.Create(&participant).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		log.Printf("Event update transaction failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Event updated successfully"})
}

// DeleteEvent удаляет событие.
func DeleteEvent(c *gin.Context) {
	currentUserID := c.GetUint("user_id")
	eventID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	var event models.Event
	if err := config.DB.First(&event, eventID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		return
	}

	if uint(event.OwnerID) != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not the owner of this event"})
		return
	}

	if err := config.DB.Delete(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete event"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Event deleted successfully"})
}

// UpdateParticipantStatus позволяет пользователю принять или отклонить приглашение.
func UpdateParticipantStatus(c *gin.Context) {
	currentUserID := c.GetUint("user_id")
	eventID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	var req ParticipantStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if req.Status != "accepted" && req.Status != "declined" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}

	result := config.DB.Model(&models.EventParticipant{}).
		Where("event_id = ? AND user_id = ?", eventID, currentUserID).
		Update("status", req.Status)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invitation not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Status updated successfully"})
}

// --- Вспомогательные функции ---

// fetchUserEvents извлекает личные события и те, на которые пользователь приглашен и принял приглашение.
func fetchUserEvents(userID uint) ([]CombinedEvent, error) {
	query := `
		SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.owner_id, e.color, e.location, e.google_meet_link
		FROM events e
		JOIN event_participants ep ON e.id = ep.event_id
		WHERE ep.user_id = ? AND ep.status = 'accepted'
	`
	rows, err := config.DB.Raw(query, userID).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []CombinedEvent
	for rows.Next() {
		var e models.Event
		var desc, color, loc, meet sql.NullString
		if err := rows.Scan(&e.ID, &e.Title, &desc, &e.StartTime, &e.EndTime, &e.OwnerID, &color, &loc, &meet); err != nil {
			log.Printf("Error scanning event: %v", err)
			continue
		}
		events = append(events, CombinedEvent{
			ID:          "event_" + strconv.Itoa(e.ID),
			Title:       e.Title,
			Start:       e.StartTime,
			End:         e.EndTime,
			AllDay:      false,
			Editable:    uint(e.OwnerID) == userID,
			Color:       color.String,
			Description: desc.String,
			Location:    loc.String,
			MeetLink:    meet.String,
		})
	}
	return events, nil
}

// fetchScheduleEvents извлекает учебное расписание для сотрудника на основе его привязки к классам.
func fetchScheduleEvents(userID uint) ([]CombinedEvent, error) {
	var classIDs []uint
	// Находим все ID классов, к которым привязан данный сотрудник
	config.DB.Model(&models.ClassAssignment{}).Where("user_id = ?", userID).Pluck("class_id", &classIDs)

	if len(classIDs) == 0 {
		return []CombinedEvent{}, nil // Если сотрудник не привязан к классам, возвращаем пустое расписание
	}

	var schedules []models.Schedule
	// Находим все расписания для найденных классов
	if err := config.DB.Where("class_id IN ?", classIDs).Find(&schedules).Error; err != nil {
		return nil, err
	}

	var scheduleEvents []CombinedEvent
	// Временная структура для парсинга JSON из schedule_data
	type Lesson struct {
		LessonNumber int    `json:"lesson_number"`
		SubjectID    uint   `json:"subject_id"`
		SubjectName  string `json:"subject_name"`
	}

	for _, schedule := range schedules {
		var scheduleData map[string][]Lesson
		// Десериализуем JSON-строку в нашу структуру
		if err := json.Unmarshal([]byte(schedule.ScheduleData), &scheduleData); err != nil {
			log.Printf("Could not unmarshal schedule data for class %d: %v", schedule.ClassID, err)
			continue
		}

		// Итерируемся по дням недели в расписании
		for day, lessons := range scheduleData {
			dayOfWeek, ok := mapDayOfWeek(day)
			if !ok {
				continue // Пропускаем, если день недели не распознан
			}

			// Итерируемся по урокам в этот день
			for _, lesson := range lessons {
				// ВАЖНО: Время уроков пока захардкожено. В будущем это можно вынести в отдельную таблицу.
				startTime, endTime := getLessonTimes(lesson.LessonNumber)

				scheduleEvents = append(scheduleEvents, CombinedEvent{
					ID:         fmt.Sprintf("schedule_%d_%s_%d", schedule.ClassID, day, lesson.LessonNumber),
					GroupID:    "schedule",
					Title:      lesson.SubjectName,
					DaysOfWeek: []int{dayOfWeek},
					StartTime:  startTime,
					EndTime:    endTime,
					Editable:   false,
					Color:      "#28a745", // Зеленый цвет для уроков
				})
			}
		}
	}

	return scheduleEvents, nil
}

// fetchBirthdays извлекает дни рождения всех активных учеников и сотрудников.
func fetchBirthdays() ([]CombinedEvent, error) {
	var birthdayEvents []CombinedEvent
	now := time.Now()

	// 1. Получаем дни рождения сотрудников
	var users []models.User
	if err := config.DB.Model(&models.User{}).Where("birth_date IS NOT NULL AND status = 'active'").Find(&users).Error; err != nil {
		return nil, err
	}

	for _, user := range users {
		if user.BirthDate != nil {
			birthDate := time.Date(now.Year(), user.BirthDate.Month(), user.BirthDate.Day(), 0, 0, 0, 0, time.UTC)
			birthdayEvents = append(birthdayEvents, CombinedEvent{
				ID:       "birthday_user_" + strconv.Itoa(int(user.ID)),
				GroupID:  "birthdays",
				Title:    "🎉 ДР сотрудника: " + user.FullName,
				Start:    birthDate,
				AllDay:   true,
				Editable: false,
				Color:    "#f39c12", // Оранжевый цвет
			})
		}
	}

	// 2. Получаем дни рождения учеников
	type StudentWithClass struct {
		ID          uint
		FirstName   string
		LastName    string
		BirthDate   *time.Time
		GradeNumber int
		LiterChar   string
	}
	var students []StudentWithClass
	err := config.DB.Table("students").
		Select("students.id, students.first_name, students.last_name, students.birth_date, c.grade_number, cl.liter_char").
		Joins("LEFT JOIN classes c ON students.class_id = c.id").
		Joins("LEFT JOIN class_liters cl ON c.liter_id = cl.id").
		Where("students.birth_date IS NOT NULL AND students.deleted_at IS NULL").
		Scan(&students).Error
	if err != nil {
		return nil, err
	}

	for _, student := range students {
		if student.BirthDate != nil {
			birthDate := time.Date(now.Year(), student.BirthDate.Month(), student.BirthDate.Day(), 0, 0, 0, 0, time.UTC)
			title := fmt.Sprintf("🎂 ДР ученика: %s %s (%d %s)", student.FirstName, student.LastName, student.GradeNumber, student.LiterChar)

			birthdayEvents = append(birthdayEvents, CombinedEvent{
				ID:       "birthday_student_" + strconv.Itoa(int(student.ID)),
				GroupID:  "birthdays",
				Title:    title,
				Start:    birthDate,
				AllDay:   true,
				Editable: false,
				Color:    "#3498db", // Синий цвет
			})
		}
	}
	return birthdayEvents, nil
}

// uniqueUint удаляет дубликаты из среза uint.
func uniqueUint(slice []uint) []uint {
	keys := make(map[uint]bool)
	var list []uint
	for _, entry := range slice {
		if _, value := keys[entry]; !value {
			keys[entry] = true
			list = append(list, entry)
		}
	}
	return list
}

// mapDayOfWeek преобразует русское название дня недели в числовой формат FullCalendar.
func mapDayOfWeek(day string) (int, bool) {
	days := map[string]int{
		"Понедельник": 1,
		"Вторник":     2,
		"Среда":       3,
		"Четверг":     4,
		"Пятница":     5,
		"Суббота":     6,
		"Воскресенье": 0,
	}
	val, ok := days[day]
	return val, ok
}

// getLessonTimes возвращает время начала и окончания урока по его номеру.
// ВАЖНО: Это временное решение. В идеале, время звонков должно храниться в базе данных.
func getLessonTimes(lessonNumber int) (string, string) {
	switch lessonNumber {
	case 1:
		return "08:30:00", "09:10:00"
	case 2:
		return "09:20:00", "10:00:00"
	case 3:
		return "10:15:00", "10:55:00"
	case 4:
		return "11:05:00", "11:45:00"
	case 5:
		return "12:30:00", "13:10:00"
	case 6:
		return "13:20:00", "14:00:00"
	case 7:
		return "14:10:00", "14:50:00"
	case 8:
		return "15:00:00", "15:40:00"
	default:
		return "00:00:00", "00:00:00"
	}
}
