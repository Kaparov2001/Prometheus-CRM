package models

// НОВАЯ СТРУКТУРА: Class представляет таблицу 'classes' в базе данных.
// Это основная GORM-модель.
type Class struct {
	ID          uint              `gorm:"primaryKey"`
	GradeNumber int               `gorm:"not null"`
	LiterID     int               `gorm:"not null"`
	Language    string            `gorm:"size:50"`
	StudyType   string            `gorm:"size:50"`
	Assignments []ClassAssignment `json:"assignments"`
}

// НОВАЯ СТРУКТУРА: ClassLiter представляет таблицу 'class_liters'.
type ClassLiter struct {
	ID        uint   `gorm:"primaryKey"`
	LiterChar string `gorm:"size:3;unique;not null"`
}

// ClassResponse - это структура для ответа API, содержащая всю необходимую информацию о классе.
type ClassResponse struct {
	ID           uint     `json:"id"`
	GradeNumber  int      `json:"grade_number"`
	LiterChar    string   `json:"liter_char"`
	StudentCount int      `json:"student_count"`
	Language     string   `json:"language"`
	StudyType    string   `json:"study_type"`
	Teachers     []string `json:"teachers"`
}

// ClassInput используется для привязки данных из JSON-запроса
// при создании или обновлении класса.
type ClassInput struct {
	GradeNumber int    `json:"grade_number" binding:"required,min=0,max=11"`
	LiterChar   string `json:"liter_char" binding:"required"`
	Language    string `json:"language"`
	StudyType   string `json:"study_type"`
	Assignments []struct {
		UserID      uint   `json:"userId" binding:"required"`
		RoleInClass string `json:"roleInClass" binding:"required"`
	} `json:"assignments"`
}
