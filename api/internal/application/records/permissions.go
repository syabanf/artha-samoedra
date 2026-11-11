package records

import "github.com/syabanf/artha-samoedra/api/internal/domain/iam"

// collectionPermission is the view permission each seeded collection needs, using the keys in
// packages/types/src/iam.ts. A collection missing here does not exist for the read side.
var collectionPermission = map[string]iam.Permission{
	// Listings and their satellites
	"listings":     "listing.view",
	"history":      "listing.view",
	"partners":     "partner.view",
	"exclusives":   "exclusive.view",
	"profitShares": "share.view",
	"settlements":  "share.view",
	"inquiries":    "inquiry.view",

	// Content and Jessy
	"socialPosts": "content.view",
	"blogPosts":   "content.view",
	"agentEvents": "jessy.view",
	"aiAgents":    "jessy.view",
	"aiPrompts":   "jessy.view",
	"aiTools":     "jessy.view",
	"aiCalls":     "jessy.view",
	"aiMemory":    "jessy.view",

	// Settings
	"users":             "settings.view",
	"roles":             "settings.view",
	"branches":          "settings.view",
	"templates":         "settings.view",
	"messages":          "settings.view",
	"notificationRules": "settings.view",
	"outbox":            "settings.view",
	"integrations":      "integrations.manage",
	"apiTokens":         "integrations.manage",
	"audit":             "audit.view",

	// Sales
	"stages":     "deal.view",
	"deals":      "deal.view",
	"quotations": "deal.view",
	"tasks":      "deal.view",
	"activities": "deal.view",
	"targets":    "deal.view",

	// CRM
	"contacts":        "crm.view",
	"accounts":        "crm.view",
	"conversations":   "crm.view",
	"segments":        "crm.view",
	"campaigns":       "crm.view",
	"leadForms":       "crm.view",
	"referrals":       "crm.view",
	"savedProperties": "crm.view",
	"workflows":       "automation.manage",
	"reports":         "report.view",

	// Operations
	"projects":    "ops.view",
	"units":       "ops.view",
	"visits":      "ops.view",
	"openHouses":  "ops.view",
	"payments":    "ops.view",
	"portalSyncs": "ops.view",
	"statements":  "ops.view",
	"promotions":  "ops.view",
	"sitePages":   "ops.view",

	// Finance
	"glAccounts":       "finance.view",
	"journals":         "finance.view",
	"autoJournals":     "finance.view",
	"fiscalYears":      "finance.view",
	"periods":          "finance.view",
	"cashTransactions": "finance.view",
	"reconciliations":  "finance.view",
	"vendors":          "finance.view",
	"bills":            "finance.view",
	"invoices":         "finance.view",
	"budgets":          "finance.view",

	// People
	"departments":        "hr.view",
	"sections":           "hr.view",
	"positions":          "hr.view",
	"employees":          "hr.view",
	"contracts":          "hr.view",
	"checklistTemplates": "hr.view",
	"checklists":         "hr.view",
	"shifts":             "hr.view",
	"scheduleOverrides":  "hr.view",
	"holidays":           "hr.view",
	"attendance":         "hr.view",
	"hrRequests":         "hr.view",
	"kpis":               "hr.view",
	"scorecards":         "hr.view",
	"reviewCycles":       "hr.view",
	"reviews":            "hr.view",
	"psychTests":         "hr.view",
	"jobOpenings":        "hr.view",
	"candidates":         "hr.view",
	"announcements":      "hr.view",
	"logbook":            "hr.view",
	"recurringTasks":     "hr.view",
	"payComponents":      "payroll.manage",
	"payrollRuns":        "payroll.manage",

	// Purchasing
	"itemCategories":   "purchase.view",
	"uoms":             "purchase.view",
	"items":            "purchase.view",
	"warehouses":       "purchase.view",
	"stockMoves":       "purchase.view",
	"stockCounts":      "purchase.view",
	"purchaseRequests": "purchase.view",
	"purchaseOrders":   "purchase.view",
	"goodsReceipts":    "purchase.view",
	"purchaseReturns":  "purchase.view",
	"vendorCredits":    "purchase.view",
	"vendorPrices":     "purchase.view",

	// Dataroom
	"dataFolders": "dataroom.view",
	"dataFiles":   "dataroom.view",
	"shareLinks":  "dataroom.share",
	"shareEvents": "dataroom.share",
}

// singletonPermission is the permission each settings object needs.
var singletonPermission = map[string]iam.Permission{
	"settings":           "settings.view",
	"company":            "settings.view",
	"appearance":         "settings.view",
	"crmSettings":        "crm.view",
	"aiSettings":         "jessy.view",
	"financeSettings":    "finance.view",
	"payrollSettings":    "payroll.manage",
	"hrSettings":         "hr.view",
	"purchasingSettings": "purchase.view",
}

// PermissionFor returns the permission a collection needs, and false when it is unknown.
func PermissionFor(collection string) (iam.Permission, bool) {
	p, ok := collectionPermission[collection]
	return p, ok
}
