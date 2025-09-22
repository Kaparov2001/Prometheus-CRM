package models

import (
	"gorm.io/gorm"
)

// Chat представляет собой отдельный чат (личный или групповой).
type Chat struct {
	gorm.Model
	Name         string `json:"name"`                                             // Название для групповых чатов
	Type         string `json:"type"`                                             // 'personal', 'group'
	CreatedByID  uint   `json:"createdById"`                                      // ID создателя чата
	CreatedBy    User   `json:"createdBy" gorm:"foreignKey:CreatedByID"`          // Связь с моделью User
	Participants []User `json:"participants" gorm:"many2many:chat_participants;"` // Участники чата (связь многие-ко-многим)
}

// ChatParticipant - связующая таблица для участников чата.
type ChatParticipant struct {
	ChatID uint   `json:"chatId" gorm:"primaryKey"`
	UserID uint   `json:"userId" gorm:"primaryKey"`
	Role   string `json:"role"` // 'member', 'admin'
}

// ChatMessage представляет одно сообщение в чате.
type ChatMessage struct {
	gorm.Model
	ChatID   uint   `json:"chatId"`
	UserID   uint   `json:"userId"`
	User     User   `json:"user" gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"` // Данные отправителя
	Type     string `json:"type" gorm:"type:varchar(20);not null;default:'text'"`                         // text, file, voice
	Content  string `json:"content"`
	FileURL  string `json:"fileUrl,omitempty" gorm:"type:varchar(255)"`
	FileName string `json:"fileName,omitempty" gorm:"type:varchar(255)"`
	FileSize int64  `json:"fileSize,omitempty"`
}

// MessageReadStatus отслеживает, какое сообщение было последним прочитано пользователем в чате.
type MessageReadStatus struct {
	ChatID            uint `json:"chatId" gorm:"primaryKey"`
	UserID            uint `json:"userId" gorm:"primaryKey"`
	LastReadMessageID uint `json:"lastReadMessageId"` // ID последнего прочитанного сообщения
}

// UserResponse - упрощенная структура для отправки информации о пользователе на фронтенд.
type UserResponse struct {
	ID       uint   `json:"ID"`
	FullName string `json:"fullName"`
	PhotoURL string `json:"photoUrl"`
}
