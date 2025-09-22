// file: models/schedule.go

package models

import "gorm.io/gorm"

// Schedule представляет собой учебное расписание для класса на определенную четверть.
type Schedule struct {
	gorm.Model
	ClassID      uint   `json:"class_id"`      // Связь с моделью Class
	AcademicYear string `json:"academic_year"` // Например, "2025-2026"
	Quarter      int    `json:"quarter"`       // I, II, III, IV
	// Данные расписания можно хранить в формате JSON для гибкости.
	// Это позволит легко добавлять/изменять уроки.
	ScheduleData string `gorm:"type:json" json:"schedule_data"`
}
