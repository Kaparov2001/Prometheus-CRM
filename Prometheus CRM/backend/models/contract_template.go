package models

import "gorm.io/gorm"

// ContractTemplate представляет модель шаблона договора в базе данных.
type ContractTemplate struct {
	gorm.Model
	Name             string `json:"name"`
	SignatureType    string `json:"signatureType"`
	Classification   string `json:"classification"`
	Status           string `json:"status"`
	FilePath         string `json:"filePath"`
	OriginalFileName string `json:"originalFileName"`
	FileSize         int64  `json:"fileSize"`
}
