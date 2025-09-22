package models

import "gorm.io/gorm"

// TuitionFee represents the cost of education for a specific grade.
type TuitionFee struct {
	gorm.Model
	Grade       int     `json:"grade" gorm:"unique;not null"` // The grade level (0-11)
	CostFor2023 float64 `json:"costFor2023"`                  // Cost for the 2023 school year
	CurrentCost float64 `json:"currentCost"`                  // Current actual cost
}
