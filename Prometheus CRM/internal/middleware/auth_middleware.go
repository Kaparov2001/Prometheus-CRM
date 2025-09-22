package middleware

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// CachedUserData - единая структура для всех данных пользователя в кэше.
type CachedUserData struct {
	UserID      uint     `json:"user_id"`
	Login       string   `json:"login"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}

// AuthMiddleware - финальная версия middleware для аутентификации и авторизации.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// ... (код для получения токена остается без изменений) ...
		tokenStr, err := c.Cookie("auth_token")
		if err != nil || tokenStr == "" {
			authHeader := c.GetHeader("Authorization")
			if authHeader == "" {
				handleAuthError(c, "Authorization token not provided")
				return
			}
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				handleAuthError(c, "Invalid Authorization header format")
				return
			}
			tokenStr = parts[1]
		}

		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return config.JwtKey, nil
		})

		if err != nil || !token.Valid {
			c.SetCookie("auth_token", "", -1, "/", "", false, true)
			handleAuthError(c, "Invalid or expired token")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			handleAuthError(c, "Invalid token claims")
			return
		}

		userIDFloat, ok := claims["user_id"].(float64)
		if !ok {
			handleAuthError(c, "Invalid user ID format in token")
			return
		}
		userID := uint(userIDFloat)

		cacheKey := fmt.Sprintf("user:%d:data", userID)
		if config.RDB != nil {
			cachedData, err := config.RDB.Get(config.Ctx, cacheKey).Result()
			if err == nil {
				var userData CachedUserData
				if json.Unmarshal([]byte(cachedData), &userData) == nil {
					slog.Info("User data loaded from CACHE", "user_id", userID)
					setContextAndProceed(c, &userData)
					return
				}
				slog.Warn("Failed to unmarshal cached user data", "user_id", userID, "data", cachedData)
			} else if err != redis.Nil {
				slog.Error("Redis GET command failed", "error", err, "user_id", userID)
			}
		}

		slog.Info("User data cache miss, loading from DATABASE", "user_id", userID)
		var dbUser models.User
		if err := config.DB.Preload("Roles").First(&dbUser, userID).Error; err != nil {
			c.SetCookie("auth_token", "", -1, "/", "", false, true)
			handleAuthError(c, "User from token not found in DB")
			return
		}

		var roleIDs []uint
		var roleNames []string
		isAdmin := false // Флаг для проверки, является ли пользователь админом
		for _, role := range dbUser.Roles {
			roleIDs = append(roleIDs, role.ID)
			roleNames = append(roleNames, role.Name)
			if role.Name == "admin" {
				isAdmin = true
			}
		}

		var permissionsList []string
		if len(roleIDs) > 0 {
			config.DB.Table("permissions").
				Joins("join role_permissions on role_permissions.permission_id = permissions.id").
				Where("role_permissions.role_id IN ?", roleIDs).
				Distinct().
				Pluck("name", &permissionsList)
		}

		// --- НАЧАЛО ГЛАВНОГО ИСПРАВЛЕНИЯ ---
		// Если пользователь - админ, принудительно добавляем право 'admin' в список.
		// Это активирует "супер-силу" на стороне JavaScript.
		if isAdmin {
			permissionsList = append(permissionsList, "admin")
		}
		// --- КОНЕЦ ГЛАВНОГО ИСПРАВЛЕНИЯ ---

		userData := CachedUserData{
			UserID:      dbUser.ID,
			Login:       dbUser.Login,
			Roles:       roleNames,
			Permissions: permissionsList,
		}

		if config.RDB != nil {
			jsonData, err := json.Marshal(userData)
			if err != nil {
				slog.Error("Failed to marshal user data for caching", "error", err, "user_id", userID)
			} else {
				err := config.RDB.Set(config.Ctx, cacheKey, jsonData, 10*time.Minute).Err()
				if err != nil {
					slog.Error("Failed to SET user data to cache", "error", err, "user_id", userID)
				} else {
					slog.Info("User data successfully cached", "user_id", userID, "permissions_count", len(permissionsList))
				}
			}
		}

		setContextAndProceed(c, &userData)
	}
}

// ... (остальные функции setContextAndProceed, PermissionMiddleware, handleAuthError остаются БЕЗ ИЗМЕНЕНИЙ) ...
func setContextAndProceed(c *gin.Context, userData *CachedUserData) {
	c.Set("user_id", userData.UserID)
	c.Set("login", userData.Login)
	c.Set("userName", userData.Login)
	c.Set("roles", userData.Roles)
	c.Set("permissions", userData.Permissions)
	c.Next()
}

func PermissionMiddleware(requiredPermission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if roles, exists := c.Get("roles"); exists {
			if userRoles, ok := roles.([]string); ok {
				for _, roleName := range userRoles {
					if roleName == "admin" {
						c.Next()
						return
					}
				}
			}
		}

		permissions, exists := c.Get("permissions")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permissions not found in context"})
			c.Abort()
			return
		}

		userPermissions, ok := permissions.([]string)
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "Internal permission format error"})
			c.Abort()
			return
		}

		for _, permissionName := range userPermissions {
			if permissionName == requiredPermission {
				c.Next()
				return
			}
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
		c.Abort()
	}
}

func handleAuthError(c *gin.Context, message string) {
	if strings.Contains(c.GetHeader("Accept"), "text/html") {
		c.Redirect(http.StatusFound, "/")
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"error": message})
	}
	c.Abort()
}
