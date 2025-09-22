// crm/models/calendar.go

package models

import "time"

// Event представляет собой событие в календаре
type Event struct {
	ID             int       `json:"id"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	StartTime      time.Time `json:"start_time"`
	EndTime        time.Time `json:"end_time"`
	OwnerID        int       `json:"owner_id"`
	Color          string    `json:"color,omitempty"`
	Location       string    `json:"location,omitempty"`
	GoogleMeetLink string    `json:"google_meet_link,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	Participants   []User    `json:"participants,omitempty"` // Для передачи участников на фронтенд
}

// EventParticipant связывает пользователя с событием
type EventParticipant struct {
	ID      int    `json:"id"`
	EventID int    `json:"event_id"`
	UserID  int    `json:"user_id"`
	Status  string `json:"status"` // pending, accepted, declined
}
