// internal/handlers/pagination.go
package handlers

import (
	"math"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PaginatedResponse defines the structure for any paginated API response.
type PaginatedResponse struct {
	Data        interface{} `json:"data"`
	TotalRows   int64       `json:"totalRows"`
	TotalPages  int         `json:"totalPages"`
	CurrentPage int         `json:"currentPage"`
	PageSize    int         `json:"pageSize"`
}

const (
	DefaultPageSize = 20
	MaxPageSize     = 100
)

// Paginate is a GORM scope that applies offset and limit to a query based on
// "page" and "pageSize" query parameters from the Gin context.
func Paginate(c *gin.Context) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		page, _ := strconv.Atoi(c.Query("page"))
		if page <= 0 {
			page = 1
		}

		pageSize, _ := strconv.Atoi(c.Query("pageSize"))
		switch {
		case pageSize > MaxPageSize:
			pageSize = MaxPageSize
		case pageSize <= 0:
			pageSize = DefaultPageSize
		}

		offset := (page - 1) * pageSize
		return db.Offset(offset).Limit(pageSize)
	}
}

// CreatePaginatedResponse constructs the standard paginated response object.
// It takes the fetched data, total row count, and the Gin context to build the response.
func CreatePaginatedResponse(c *gin.Context, data interface{}, totalRows int64) PaginatedResponse {
	page, _ := strconv.Atoi(c.Query("page"))
	if page <= 0 {
		page = 1
	}

	pageSize, _ := strconv.Atoi(c.Query("pageSize"))
	switch {
	case pageSize > MaxPageSize:
		pageSize = MaxPageSize
	case pageSize <= 0:
		pageSize = DefaultPageSize
	}

	totalPages := 0
	if totalRows > 0 {
		totalPages = int(math.Ceil(float64(totalRows) / float64(pageSize)))
	}

	return PaginatedResponse{
		Data:        data,
		TotalRows:   totalRows,
		TotalPages:  totalPages,
		CurrentPage: page,
		PageSize:    pageSize,
	}
}
