# PHASE 0.5: EMERGENCY PRUNING PLAN
**Date:** 2026-01-10  
**Objective:** Reduce codebase by 40-60% WITHOUT breaking navigation

---

## CRITICAL CONSTRAINT: ZERO NAVIGATION BREAKAGE

**RULE:** Do NOT remove any page that appears in `navigationConfig.js`  
**REASON:** User requirement - all features must remain accessible via sidebar

---

## SAFE DELETION TARGETS

### Category 1: Duplicate/Redundant Components (30 files)
**Risk:** LOW - Not used in routes, pure duplicates

- `/components/dashboard/` - Multiple redundant dashboard components
- `/components/reports/` - 5+ report builder variants (keep 1 unified)
- `/components/threat/` - Duplicate threat intel components
- `/components/analytics/` - Overlapping analytics widgets

**Action:** Consolidate to 1 implementation each, delete redundants

---

### Category 2: Backend Functions - Unused/Incomplete (50+ functions)
**Risk:** ZERO - Backend only, no navigation impact

**Delete Immediately:**
- Honeypot functions (feature incomplete)
- Blockchain evidence functions (placeholder)
- Social media monitoring (incomplete)
- Geofencing automation (unused)
- VPN rotation (backend exists, frontend unclear)
- 20+ "AI" functions with no frontend

**Keep:**
- All enrichment functions (active in UI)
- Case/Evidence CRUD (core workflow)
- Audit/compliance functions (active)
- Analytics functions (active)

---

### Category 3: Component Consolidation (20 files)
**Risk:** MEDIUM - Requires refactoring imports

**Report Builders - CONSOLIDATE TO ONE:**
- Keep: `ReportBuilder` (most complete)
- Delete: `AIReportBuilder`, `ManualReportBuilder`, `AdvancedReportBuilder`
- Update: All imports to use unified `ReportBuilder`

**Dashboard Components - MERGE:**
- Keep: Main dashboard per entity
- Delete: Redundant "mini dashboards"

---

### Category 4: Dead Entities (10 entities)
**Risk:** LOW - No active UI usage detected

**Candidates for removal:**
- `Honeypot` (feature incomplete)
- `CovertOperation` (feature incomplete)  
- `BlockchainEvidence` (placeholder)
- `SocialMediaMonitor` (incomplete)
- `GeoFence` (unused)

**Validation Required:** Check for any backend function references

---

## WHAT STAYS (PROTECTED)

### All Pages in Navigation Config (90+ pages)
✅ **Dashboard** - Core workflow  
✅ **Cases** - Core workflow  
✅ **Evidence** - Core workflow  
✅ **CaseDetail** - Core workflow  
✅ **All Device pages** - Complete feature set  
✅ **All Intelligence pages** - Complete feature set  
✅ **All Enrichment pages** - Complete feature set  
✅ **All Admin pages** - Required for operations  

### All Core Entities
✅ Case, Evidence, CaseMember, CaseActivity, CaseTask  
✅ Indicator, EnrichmentRun, EnrichmentResult  
✅ Device, Alert, Agent*  
✅ All audit/compliance entities  

---

## EXECUTION PLAN

### Step 1: Backend Function Cleanup (SAFE)
- Delete 50+ unused backend functions
- No navigation impact
- **Time:** 10 minutes

### Step 2: Component Consolidation (CAREFUL)
- Merge duplicate report builders
- Update imports
- **Time:** 15 minutes

### Step 3: Dead Code Removal (VERIFY FIRST)
- Remove unused utility files
- Delete placeholder components
- **Time:** 10 minutes

### Step 4: Entity Cleanup (LAST)
- Remove unused entities
- Verify no backend references
- **Time:** 5 minutes

---

## SUCCESS METRICS

✅ Navigation sidebar still shows all items  
✅ All routes still resolve  
✅ No broken imports  
✅ App still builds  
✅ Codebase reduced by ~50%

---

## ROLLBACK STRATEGY

If anything breaks:
1. Git revert specific commit
2. Fix imports individually
3. Re-test navigation

---

## NAVIGATION VERIFICATION CHECKLIST

Before committing each batch:
- [ ] Sidebar renders all categories
- [ ] All menu items clickable
- [ ] All routes resolve without errors
- [ ] Mobile hamburger menu works
- [ ] No console errors related to navigation

---

**STATUS:** Ready to execute Step 1 (Backend Functions)