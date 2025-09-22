// internal/handlers/contract_pdf.go
package handlers

import "github.com/gin-gonic/gin"

// Backward-compatible alias (если где-то вызывался другой хендлер)
func DownloadContractPDF(c *gin.Context) {
	DownloadContractHandler(c)
}
