export function isCaseLinkedToLegalMatter(legalCase, caseId): boolean {
  return Array.isArray(legalCase?.forensic_case_ids)
    && legalCase.forensic_case_ids.includes(caseId);
}
