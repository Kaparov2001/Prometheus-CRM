package models

import "gorm.io/gorm"

// NewsPostFile представляет один файл, прикрепленный к посту
type NewsPostFile struct {
	gorm.Model
	NewsPostID uint   `json:"news_post_id"`
	FileUrl    string `json:"file_url"`
	FileType   string `json:"file_type"` // 'image', 'video', 'file'
}

// NewsPost представляет модель поста в новостной ленте
type NewsPost struct {
	gorm.Model
	AuthorID     uint   `json:"author_id"`
	User         User   `json:"author" gorm:"foreignKey:AuthorID"`
	Content      string `json:"content" gorm:"type:text"`
	Type         string `json:"type" gorm:"type:varchar(50);default:'message'"`
	PollQuestion string `json:"poll_question,omitempty"`

	// ИЗМЕНЕНИЕ: Заменяем одно поле для файла на срез (много файлов)
	Files       []NewsPostFile `json:"files,omitempty" gorm:"foreignKey:NewsPostID;constraint:OnDelete:CASCADE;"`
	PollOptions []PollOption   `json:"poll_options,omitempty" gorm:"foreignKey:NewsPostID;constraint:OnDelete:CASCADE;"`
}

// PollOption ... (остальная часть файла без изменений)
type PollOption struct {
	gorm.Model
	NewsPostID uint       `json:"news_post_id"`
	Text       string     `json:"text"`
	Votes      []PollVote `json:"votes" gorm:"foreignKey:PollOptionID;constraint:OnDelete:CASCADE;"`
}

type PollVote struct {
	gorm.Model
	PollOptionID uint `json:"poll_option_id"`
	UserID       uint `json:"user_id"`
}
