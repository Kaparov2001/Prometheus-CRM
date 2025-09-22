// prometheus-crm/models/student.go

package models

import (
	"time"

	"gorm.io/gorm"
)

// ... (структура FamilyLink остается без изменений) ...
type FamilyLink struct {
	gorm.Model
	StudentID        uint    `json:"studentId"`
	RelativeID       uint    `json:"relativeId"`
	RelationshipType string  `json:"relationshipType"`
	Relative         Student `gorm:"foreignKey:RelativeID"`
}

// Student represents the student model in the database.
type Student struct {
	gorm.Model
	PhotoURL string `json:"photoUrl"`
	ClassID  *uint  `json:"classId"`

	// --- BASIC INFO TAB ---
	IsStudying   *bool      `json:"isStudying" gorm:"default:true"`
	LastName     string     `json:"lastName" gorm:"not null"`
	FirstName    string     `json:"firstName" gorm:"not null"`
	MiddleName   string     `json:"middleName"`
	IIN          string     `json:"iin" gorm:"unique"`
	Gender       string     `json:"gender"`
	BirthDate    *time.Time `json:"birthDate"`
	StudentPhone string     `json:"studentPhone"`
	Email        string     `json:"email"`
	StartDate    *time.Time `json:"startDate"`
	EndDate      *time.Time `json:"endDate"`
	MothersName  string     `json:"mothersName"`
	MothersPhone string     `json:"mothersPhone"`
	FathersName  string     `json:"fathersName"`
	FathersPhone string     `json:"fathersPhone"`
	Comments     string     `json:"comments"`
	Language     string     `json:"language"`
	GradeID      *uint      `json:"gradeId"`
	GroupID      *uint      `json:"groupId"`

	// --- CONTRACT INFO TAB ---
	ContractParentName           string     `json:"contractParentName"`
	ContractParentIIN            string     `json:"contractParentIIN"`
	ContractParentBirthDate      *time.Time `json:"contractParentBirthDate"`
	ContractParentEmail          string     `json:"contractParentEmail"`
	ContractParentPhone          string     `json:"contractParentPhone"`
	ContractParentDocumentNumber string     `json:"contractParentDocumentNumber"`
	ContractParentDocumentInfo   string     `json:"contractParentDocumentInfo"`

	// --- ADDITIONAL INFO TAB ---
	IsResident                *bool  `json:"isResident" gorm:"default:true"`
	BirthCertificateNumber    string `json:"birthCertificateNumber"`
	BirthCertificateIssueInfo string `json:"birthCertificateIssueInfo"`
	MothersWorkPlace          string `json:"mothersWorkPlace"`
	FathersWorkPlace          string `json:"fathersWorkPlace"`
	MothersJobTitle           string `json:"mothersJobTitle"`
	FathersJobTitle           string `json:"fathersJobTitle"`
	HomeAddress               string `json:"homeAddress"`
	MedicalInfo               string `json:"medicalInfo"`
	ShuttleRouteID            *uint  `json:"shuttleRouteId"`
	ClinicID                  *uint  `json:"clinicId"`
	NationalityID             *uint  `json:"nationalityId"`
	PreviousSchoolID          *uint  `json:"previousSchoolId"`

	// ✅ ДОБАВЬТЕ ЭТУ СТРОКУ
	FamilyOrder int `json:"familyOrder" gorm:"default:999"`

	// --- GORM RELATIONSHIPS ---
	FamilyLinks []FamilyLink `gorm:"foreignKey:StudentID" json:"familyLinks,omitempty"`
	Class       *Class       `gorm:"foreignKey:ClassID" json:"class,omitempty"`
	Grade       *Grade       `gorm:"foreignKey:GradeID" json:"grade,omitempty"`
	Group       *Group       `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	Nationality *Nationality `gorm:"foreignKey:NationalityID" json:"nationality,omitempty"`
}
