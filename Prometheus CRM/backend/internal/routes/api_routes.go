// prometheus-crm/internal/routes/api_routes.go
package routes

import (
	"prometheus-crm/internal/handlers"
	"prometheus-crm/internal/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterAPIRoutes регистрирует все маршруты API, требующие аутентификации.
func RegisterAPIRoutes(api *gin.RouterGroup) {
	// Группа для всех API-запросов с префиксом /api
	apiGroup := api.Group("/api")
	{
		// --- НОВОСТНАЯ ЛЕНТА ---
		newsfeed := apiGroup.Group("/newsfeed")
		{
			newsfeed.GET("", handlers.ListNewsPostsHandler)
			newsfeed.POST("", handlers.CreateNewsPostHandler)                // Этот обработчик теперь умеет создавать и опросы
			newsfeed.PUT("/:id", handlers.UpdateNewsPostHandler)             // <-- НОВЫЙ
			newsfeed.DELETE("/:id", handlers.DeleteNewsPostHandler)          // <-- НОВЫЙ
			newsfeed.POST("/:id/vote/:optionId", handlers.VoteInPollHandler) // <-- НОВЫЙ
		}

		// Профиль пользователя
		profile := apiGroup.Group("/profile")
		{
			profile.GET("", handlers.GetProfileHandler)
			profile.PUT("", handlers.UpdateProfileHandler)
		}

		// --- ЧАТ ---
		chat := apiGroup.Group("/chat")
		{
			// WebSocket эндпоинт
			chat.GET("/ws", func(c *gin.Context) {
				handlers.ChatWSEndpoint(c)
			})
			// API для получения списка чатов пользователя
			chat.GET("/rooms", handlers.ListChatsHandler)
			// API для получения сообщений конкретного чата
			chat.GET("/rooms/:id/messages", handlers.GetMessagesHandler)
			// API для создания нового чата
			chat.POST("/rooms", handlers.CreateChatHandler)
			chat.GET("/users", handlers.ListAllUsersForChatHandler)
			chat.POST("/upload", handlers.UploadFileHandler)
		}

		// --- СЧЕТА ---
		invoices := apiGroup.Group("/invoices")
		{
			invoices.POST("/submit", middleware.PermissionMiddleware("invoices_submit"), handlers.SubmitInvoiceHandler)
			invoices.POST("/:id/resubmit", middleware.PermissionMiddleware("invoices_submit"), handlers.ResubmitInvoiceHandler)
			invoices.POST("/recognize", middleware.PermissionMiddleware("invoices_submit"), handlers.RecognizeInvoiceHandler)
			invoices.GET("", handlers.ListInvoicesHandler)
			invoices.GET("/finance-queue", middleware.PermissionMiddleware("invoices_view_finance"), handlers.GetFinanceInvoiceQueueHandler)
			invoices.GET("/accounting-queue", middleware.PermissionMiddleware("invoices_view_accounting"), handlers.GetAccountingInvoiceQueueHandler)
			invoices.GET("/all", middleware.PermissionMiddleware("invoices_view_all"), handlers.ListAllInvoicesHandler)
			invoices.GET("/archive/download", middleware.PermissionMiddleware("invoices_view_all"), handlers.DownloadInvoiceArchiveHandler)
			invoices.GET("/counts", handlers.GetInvoiceCountsHandler)
			invoices.GET("/:id", handlers.GetInvoiceHandler)
			invoices.GET("/:id/balance", middleware.PermissionMiddleware("invoices_view_all"), handlers.GetInvoiceBalanceHandler)
			invoices.POST("/:id/decide", middleware.PermissionMiddleware("invoices_decide"), handlers.DecideInvoiceHandler)
			invoices.POST("/:id/mark-paid", middleware.PermissionMiddleware("invoices_mark_paid"), handlers.MarkAsPaidHandler)
			invoices.POST("/:id/accounting-rework", middleware.PermissionMiddleware("invoices_rework"), handlers.AccountingReworkHandler)
			invoices.POST("/:id/archive", middleware.PermissionMiddleware("invoices_archive"), handlers.ArchiveInvoiceHandler)
			invoices.POST("/:id/upload-closing-docs", middleware.PermissionMiddleware("invoices_upload_docs"), handlers.UploadClosingDocumentsHandler)
			invoices.POST("/:id/upload-accounting-docs", middleware.PermissionMiddleware("invoices_upload_accounting_docs"), handlers.UploadAccountingDocumentsHandler)
		}

		// --- БЮДЖЕТ ---
		budget := apiGroup.Group("/budget")
		{
			budget.POST("/departments", middleware.PermissionMiddleware("create_budget"), handlers.CreateDepartmentsHandler)
			budget.GET("/departments", middleware.PermissionMiddleware("view_budget"), handlers.GetDepartmentsHandler)
			budget.PUT("/departments/:id", middleware.PermissionMiddleware("create_budget"), handlers.UpdateDepartmentHandler)
			budget.DELETE("/departments/:id", middleware.PermissionMiddleware("delete_budget"), handlers.DeleteDepartmentHandler)

			budget.POST("/items", middleware.PermissionMiddleware("create_budget"), handlers.CreateBudgetItemsHandler)
			budget.GET("/items", middleware.PermissionMiddleware("view_budget"), handlers.GetBudgetItemsByDepartmentHandler)
			budget.PUT("/items/:id", middleware.PermissionMiddleware("create_budget"), handlers.UpdateBudgetItemHandler)
			budget.DELETE("/items/:id", middleware.PermissionMiddleware("delete_budget"), handlers.DeleteBudgetItemHandler)

			budget.GET("/registry-items-by-department", middleware.PermissionMiddleware("view_budget"), handlers.GetRegistryItemsByDepartmentHandler)
			budget.GET("/registry-items/:id", middleware.PermissionMiddleware("view_budget"), handlers.GetRegistryEntryHandler)
			budget.PUT("/registry-items/:id", middleware.PermissionMiddleware("create_budget"), handlers.UpdateRegistryEntryHandler)
			budget.POST("/registry-items", middleware.PermissionMiddleware("create_budget"), handlers.CreateRegistryItemHandler)
			budget.DELETE("/registry-items/:id", middleware.PermissionMiddleware("delete_budget"), handlers.DeleteRegistryEntryHandler)

			budget.GET("/data", middleware.PermissionMiddleware("view_budget"), handlers.GetBudgetDataHandler)
			budget.GET("/balance", middleware.PermissionMiddleware("view_budget"), handlers.GetBudgetBalanceHandler)
		}

		// --- СТУДЕНТЫ ---
		students := apiGroup.Group("/students")
		students.Use(middleware.PermissionMiddleware("students_view"))
		{
			students.GET("", handlers.ListStudentsHandler)
			students.POST("", middleware.PermissionMiddleware("students_create"), handlers.CreateStudentHandler)
			students.GET("/:id", handlers.GetStudentHandler)
			students.PUT("/:id", middleware.PermissionMiddleware("students_edit"), handlers.UpdateStudentHandler)
			students.DELETE("/:id", middleware.PermissionMiddleware("students_delete"), handlers.DeleteStudentHandler)
			students.POST("/:id/relatives", middleware.PermissionMiddleware("students_edit"), handlers.AddFamilyLinkHandler)
			students.DELETE("/:id/relatives/:relativeId", middleware.PermissionMiddleware("students_edit"), handlers.RemoveFamilyLinkHandler)
			students.POST("/family-order", middleware.PermissionMiddleware("students_edit"), handlers.UpdateFamilyOrderHandler)
			students.GET("/:id/contracts", handlers.ListStudentContractsHandler)
		}

		// --- СТОИМОСТЬ ОБУЧЕНИЯ ---
		tuitionFees := apiGroup.Group("/tuition-fees")
		tuitionFees.Use(middleware.PermissionMiddleware("tuition_fees_view"))
		{
			tuitionFees.GET("", handlers.GetTuitionFeesHandler)
			tuitionFees.POST("", middleware.PermissionMiddleware("tuition_fees_edit"), handlers.UpdateTuitionFeesHandler)
		}

		// --- ПОЛЬЗОВАТЕЛИ ---
		users := apiGroup.Group("/users")
		users.Use(middleware.PermissionMiddleware("users_view"))
		{
			users.GET("", handlers.ListUsersHandler)
			users.POST("", middleware.PermissionMiddleware("users_create"), handlers.CreateUserHandler)
			users.GET("/:id", handlers.GetUserHandler)
			users.PUT("/:id", middleware.PermissionMiddleware("users_edit"), handlers.UpdateUserHandler)
			users.DELETE("/:id", middleware.PermissionMiddleware("users_delete"), handlers.DeleteUserHandler)
		}

		// --- РОЛИ ---
		roles := apiGroup.Group("/roles")
		roles.Use(middleware.PermissionMiddleware("roles_view"))
		{
			roles.GET("", handlers.ListRolesHandler)
			roles.POST("", middleware.PermissionMiddleware("roles_create"), handlers.CreateRoleHandler)
			roles.GET("/:id", handlers.GetRoleHandler)
			roles.PUT("/:id", middleware.PermissionMiddleware("roles_edit"), handlers.UpdateRoleHandler)
			roles.DELETE("/:id", middleware.PermissionMiddleware("roles_delete"), handlers.DeleteRoleHandler)
		}

		// --- ПРАВА ДОСТУПА ---
		permissions := apiGroup.Group("/permissions")
		permissions.Use(middleware.PermissionMiddleware("permissions_view"))
		{
			permissions.GET("", handlers.ListPermissionsHandler)
			permissions.POST("", middleware.PermissionMiddleware("permissions_create"), handlers.CreatePermissionHandler)
			permissions.PUT("/:id", middleware.PermissionMiddleware("permissions_edit"), handlers.UpdatePermissionHandler)
			permissions.DELETE("/:id", middleware.PermissionMiddleware("permissions_delete"), handlers.DeletePermissionHandler)
		}

		// --- ПРЕДМЕТЫ (для расписания) ---
		subjects := apiGroup.Group("/subjects")
		{
			// У права 'schedules_view' достаточно прав для просмотра предметов
			subjects.GET("", middleware.PermissionMiddleware("schedules_view"), handlers.ListSubjectsHandler)
		}

		// --- НАЦИОНАЛЬНОСТИ ---
		nationalities := apiGroup.Group("/nationalities")
		nationalities.Use(middleware.PermissionMiddleware("nationalities_view"))
		{
			nationalities.GET("", handlers.ListNationalitiesHandler)
			nationalities.POST("", middleware.PermissionMiddleware("nationalities_create"), handlers.CreateNationalityHandler)
			nationalities.GET("/:id", handlers.GetNationalityHandler)
			nationalities.PUT("/:id", middleware.PermissionMiddleware("nationalities_edit"), handlers.UpdateNationalityHandler)
			nationalities.DELETE("/:id", middleware.PermissionMiddleware("nationalities_delete"), handlers.DeleteNationalityHandler)
		}

		// --- ДОГОВОРЫ ---
		contracts := apiGroup.Group("/contracts")
		contracts.Use(middleware.PermissionMiddleware("contracts_view"))
		{
			contracts.GET("", handlers.ListContractsHandler)
			contracts.GET("/all-for-plan", handlers.ListAllContractsForPlanHandler)
			contracts.POST("", middleware.PermissionMiddleware("contracts_create"), handlers.CreateContractHandler)
			contracts.GET("/:id", handlers.GetContractHandler)
			contracts.PUT("/:id", middleware.PermissionMiddleware("contracts_edit"), handlers.UpdateContractHandler)
			contracts.DELETE("/:id", middleware.PermissionMiddleware("contracts_delete"), handlers.DeleteContractHandler)
			contracts.POST("/:id/generate-schedule", middleware.PermissionMiddleware("contracts_edit"), handlers.GenerateScheduleHandler)
			contracts.GET("/:id/download", handlers.DownloadContractHandler)
			contracts.POST("/:id/preview-plan", handlers.PreviewPaymentPlanHandler)
			contracts.POST("/:id/generate-plan", middleware.PermissionMiddleware("planned_payments_generate"), handlers.GeneratePaymentPlanForContractHandler)
			contracts.POST("/:id/comment", middleware.PermissionMiddleware("contracts_edit"), handlers.UpdateContractCommentHandler)
			// (удалена битая строка: auth.GET("/contracts/:id/download", h.DownloadContractHandler))
		}

		// --- КЛАССЫ ---
		classes := apiGroup.Group("/classes")
		classes.Use(middleware.PermissionMiddleware("classes_view"))
		{
			classes.GET("", handlers.ListClassesHandler)
			classes.POST("", middleware.PermissionMiddleware("classes_create"), handlers.CreateClassHandler)
			classes.GET("/:id", handlers.GetClassHandler)
			classes.PUT("/:id", middleware.PermissionMiddleware("classes_edit"), handlers.UpdateClassHandler)
			classes.DELETE("/:id", middleware.PermissionMiddleware("classes_delete"), handlers.DeleteClassHandler)
		}

		// --- РАСПИСАНИЕ ---
		schedule := apiGroup.Group("/schedule")
		{
			schedule.GET("", middleware.PermissionMiddleware("schedules_view"), handlers.GetScheduleHandler)
			schedule.POST("", middleware.PermissionMiddleware("schedules_create"), handlers.CreateOrUpdateScheduleHandler)
			schedule.GET("/generate-ai", middleware.PermissionMiddleware("schedules_create"), handlers.GenerateScheduleAIHandler)
		}

		// --- КАЛЕНДАРЬ ---
		calendar := apiGroup.Group("/calendar")
		{
			calendar.GET("/events", handlers.GetEvents)
			calendar.POST("/events", handlers.CreateEvent)
			calendar.PUT("/events/:id", handlers.UpdateEvent)
			calendar.DELETE("/events/:id", handlers.DeleteEvent)
			calendar.POST("/events/:id/participants/status", handlers.UpdateParticipantStatus)
		}

		// --- ФОРМЫ ОПЛАТЫ ---
		paymentForms := apiGroup.Group("/payment-forms")
		paymentForms.Use(middleware.PermissionMiddleware("payment_forms_view"))
		{
			paymentForms.GET("", handlers.ListPaymentFormsHandler)
			paymentForms.POST("", middleware.PermissionMiddleware("payment_forms_create"), handlers.CreatePaymentFormHandler)
			paymentForms.GET("/:id", handlers.GetPaymentFormHandler)
			paymentForms.PUT("/:id", middleware.PermissionMiddleware("payment_forms_edit"), handlers.UpdatePaymentFormHandler)
			paymentForms.DELETE("/:id", middleware.PermissionMiddleware("payment_forms_delete"), handlers.DeletePaymentFormHandler)
		}

		// --- ШАБЛОНЫ ДОГОВОРОВ ---
		contractTemplates := apiGroup.Group("/contract-templates")
		{
			contractTemplates.GET("", middleware.PermissionMiddleware("contract_templates_view"), handlers.ListContractTemplatesHandler)
			contractTemplates.GET("/:id", middleware.PermissionMiddleware("contract_templates_view"), handlers.GetContractTemplateHandler)
			contractTemplates.POST("", middleware.PermissionMiddleware("contract_templates_create"), handlers.CreateContractTemplateHandler)
			contractTemplates.PUT("/:id", middleware.PermissionMiddleware("contract_templates_edit"), handlers.UpdateContractTemplateHandler)
			contractTemplates.DELETE("/:id", middleware.PermissionMiddleware("contract_templates_delete"), handlers.DeleteContractTemplateHandler)
		}

		// --- ПЛАНОВЫЕ ПЛАТЕЖИ ---
		plannedPayments := apiGroup.Group("/planned-payments")
		// plannedPayments.Use(middleware.PermissionMiddleware("planned_payments_view"))
		{
			plannedPayments.GET("/", handlers.ListPlannedPaymentsHandler)
			plannedPayments.GET("/export", handlers.ExportPlannedPaymentsHandler)
			plannedPayments.GET("/:id", handlers.GetPlannedPaymentHandler)
			plannedPayments.PUT("/:id", middleware.PermissionMiddleware("planned_payments_edit"), handlers.UpdatePlannedPaymentHandler)
			plannedPayments.DELETE("/:id", middleware.PermissionMiddleware("planned_payments_edit"), handlers.DeletePlannedPaymentHandler)
		}

		// --- ФАКТИЧЕСКИЕ ПЛАТЕЖИ ---
		payments := apiGroup.Group("/payments")
		{
			payments.POST("/actual", middleware.PermissionMiddleware("actual_payments_create"), handlers.CreateActualPayment)
		}

		// --- ВНЕШНИЕ СЕРВИСЫ (WEBHOOKS) ---
		webhooks := apiGroup.Group("/webhooks")
		{
			webhooks.POST("/1c-payment", handlers.Webhook1CHandler)
		}

		// --- ФАКТИЧЕСКИЕ ПЛАТЕЖИ (CRUD) ---
		paymentFacts := apiGroup.Group("/payment-facts")
		{
			paymentFacts.GET("", handlers.ListPaymentFacts)
			paymentFacts.POST("", handlers.CreatePaymentFact)
			paymentFacts.GET("/:id", handlers.GetPaymentFact)
			paymentFacts.PUT("/:id", handlers.UpdatePaymentFact)
			paymentFacts.DELETE("/:id", handlers.DeletePaymentFact)
		}

		// --- СВЕРКА ПЛАТЕЖЕЙ ---
		reconciliation := apiGroup.Group("/payment-reconciliation")
		{
			reconciliation.GET("/debtors", middleware.PermissionMiddleware("payment_reconciliation_view"), handlers.ListDebtorsHandler)
		}

		// --- ИНТЕГРАЦИИ ---
		integrations := apiGroup.Group("/integrations")
		integrations.Use(middleware.PermissionMiddleware("integrations_view")) // Право на просмотр
		{
			trustme := integrations.Group("/trustme")
			trustme.Use(middleware.PermissionMiddleware("integrations_manage")) // Право на управление
			{
				trustme.GET("/settings", handlers.GetTrustMeSettingsHandler)
				trustme.POST("/settings", handlers.SaveTrustMeSettingsHandler)
				trustme.POST("/send/:contractId", handlers.SendContractToTrustMeHandler)
			}
			// Маршруты, доступные с правом просмотра
			trustme.GET("/contracts-to-sign", handlers.ListContractsForSigningHandler)
			trustme.GET("/documents", handlers.ListSentTrustMeDocumentsHandler)
		}
	} // конец apiGroup
}
