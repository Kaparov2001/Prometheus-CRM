package handlers

// getMonthIndex - вспомогательная функция для преобразования названия месяца в его порядковый номер (0-11).
func getMonthIndex(monthStr string) int {
	months := map[string]int{
		"Январь": 0, "Февраль": 1, "Март": 2, "Апрель": 3, "Май": 4, "Июнь": 5,
		"Июль": 6, "Август": 7, "Сентябрь": 8, "Октябрь": 9, "Ноябрь": 10, "Декабрь": 11,
	}
	return months[monthStr]
}
