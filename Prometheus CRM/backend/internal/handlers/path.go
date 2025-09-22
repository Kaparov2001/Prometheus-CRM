// internal/handlers/path.go
package handlers

import (
	"errors"
	"os"
)

// contractsBaseDir возвращает базовую директорию для хранения PDF договоров.
// Если переменная окружения CONTRACTS_DIR не задана — используется ./storage/contracts.
func contractsBaseDir() string {
	if v := os.Getenv("CONTRACTS_DIR"); v != "" {
		return v
	}
	return "./storage/contracts"
}

// ensureDir гарантирует существование директории.
// Если путь существует и это файл — вернёт ошибку.
func ensureDir(path string) error {
	if path == "" {
		return errors.New("empty dir path")
	}
	info, err := os.Stat(path)
	if err == nil {
		if !info.IsDir() {
			return errors.New("path exists and is not a directory")
		}
		return nil
	}
	if !os.IsNotExist(err) {
		return err
	}
	return os.MkdirAll(path, 0o755)
}

// fileExists проверяет, что существует обычный файл (не директория).
func fileExists(p string) bool {
	if p == "" {
		return false
	}
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
