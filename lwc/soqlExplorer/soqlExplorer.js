import { LightningElement, track, wire } from 'lwc';
import getObjects from '@salesforce/apex/SoqlExplorerController.getObjects';
import getFields from '@salesforce/apex/SoqlExplorerController.getFields';
import runQuery from '@salesforce/apex/SoqlExplorerController.runQuery';
import runRawQuery from '@salesforce/apex/SoqlExplorerController.runRawQuery';
import deleteRecords from '@salesforce/apex/SoqlExplorerController.deleteRecords';
import exportToExcel from '@salesforce/apex/SoqlExplorerController.exportToExcel';
import deleteAllByQuery from '@salesforce/apex/SoqlExplorerController.deleteAllByQuery';
import ideaIcon from '@salesforce/resourceUrl/Idea_Icon';
//import CMP_BASE_URL from '@salesforce/label/c.CMP_StratusURL';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// List of SOQL keywords (add/remove as needed)
const SOQL_KEYWORDS = [
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'SELECT',
  'FROM',
  'WHERE',
  'LIMIT',
  'OFFSET',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'ASC',
  'DESC',
  'COUNT_DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'WITH',
  'ROLLUP'
];

export default class QueryUtility extends NavigationMixin(LightningElement) {

    @track recentQueries = [];
    @track savedQueries = [];
    @track allObjects = [];
    @track filteredObjects = [];
    //@track objectOptions = [];
    @track fieldOptions = [];
    @track selectedObject;
    @track selectedFields = [];
    @track whereClause = '';
    @track data;
    @track columns;
    @track soqlText = '';
    @track isSoqlManuallyEdited = false;  
    @track selectedRows = [];
    @track selectedRowIds = [];
    @track globalSearchKey = '';        
    @track filteredData = null;    
    @track soqlErrorMessage = null;
    @track soqlWarningMessage = null; 
    @track showDeleteAllModal = false;    

    objectSearchKey = '';

    @track limitSize = 200;
    pageSize = 10;
    offset = 0;
    iconLink = ideaIcon;
    developedBy = 'Mehdi Hasan (mehdi.hasan9b@gmail.com)';

    // Load data from LocalStorage on initialization
    connectedCallback() {
        this.loadHistory();
    }

    loadHistory() {
        const history = localStorage.getItem('recentQueries');
        const saved = localStorage.getItem('savedQueries');
        if (history) this.recentQueries = JSON.parse(history);
        if (saved) this.savedQueries = JSON.parse(saved);
    }

    // LOGIC: Save Manual Query (The Save Icon beside label)
    handleSaveCurrentQuery() {
        if (!this.soqlText || this.soqlText.trim() === '') {
            this.showToast('Error', 'Cannot save an empty query', 'error');
            return;
        }
        
        let saved = [...this.savedQueries];
        // If query exists, remove old one to move it to top
        saved = saved.filter(q => q !== this.soqlText);
        
        // Add to top
        saved.unshift(this.soqlText);
        
        // Limit to 20
        if (saved.length > 20) saved.pop();
        
        this.savedQueries = saved;
        localStorage.setItem('savedQueries', JSON.stringify(this.savedQueries));

        // Success Toast
        this.showToast('Success', 'Query saved to favorites', 'success');
    }

    // LOGIC: Recent History (Triggered when user clicks "Run Query")
    addToHistory(query) {
        if (!query) return;
        
        let history = [...this.recentQueries];
        // Remove existing to handle "Move to Top" logic
        history = history.filter(q => q !== query);
        
        // Add to start (Top)
        history.unshift(query);
        
        // FIFO: Limit to 20
        if (history.length > 20) history.pop();
        
        this.recentQueries = history;
        localStorage.setItem('recentQueries', JSON.stringify(this.recentQueries));
    }

    clearHistory(event) {
        // Prevent the menu's onselect from firing for this specific click
        event.stopPropagation();
        
        this.recentQueries = [];
        localStorage.removeItem('recentQueries');
        
        // Optional: If you use a toast component
        this.showToast('Success', 'History cleared', 'success');
    }

    // Handle selection from dropdowns
    handleHistorySelect(event) {
        this.soqlText = event.detail.value;
        //this.addToHistory(this.soqlText); // Move it to top because it was used
    }

    handleSavedSelect(event) {
        this.soqlText = event.detail.value;
        //this.addToHistory(this.soqlText); // Also add to history when used
    }

    // Delete Saved Query Logic
    handleDeleteSaved(event) {
        event.stopPropagation(); // Prevent menu from closing if possible
        const queryToDelete = event.target.dataset.query;
        this.savedQueries = this.savedQueries.filter(q => q !== queryToDelete);
        localStorage.setItem('savedQueries', JSON.stringify(this.savedQueries));
        this.showToast('Deleted', 'Query removed from saved list', 'info');
    }

    // call from template: onselect={handleMenuSelect}
    handleMenuSelect(event) {
        const action = event.detail.value;
        switch (action) {
            case 'export':
            if (typeof this.handleExport === 'function') {
                this.handleExport();
            }
            break;
            case 'delete':
            if (typeof this.handleDelete === 'function') {
                this.handleDelete();
            }
            break;
            case 'bulkDelete':
            if (typeof this.handleDeleteAllClick === 'function') {
                this.handleDeleteAllClick();
            }
            break;
            default:
            break;
        }
    }

    get disablePrev() {
        return this.offset === 0;
    }

    get disableNext() {
        return this.offset + this.pageSize >= this.totalRecords;
    }

    get totalRecords() {
        const source = this.filteredData !== null
            ? this.filteredData
            : this.data;
        return source ? source.length : 0;
    }

    get startRecord() {
        return this.totalRecords ? this.offset + 1 : 0;
    }

    get endRecord() {
        return Math.min(this.offset + this.pageSize, this.totalRecords);
    }

    get hasData() {
        return this.data && this.data.length > 0;
    }

    get isObjectSelected() {
        return !!this.selectedObject;
    }
    
    get showObjectSearchResults() {
        return (
            !this.selectedObject &&                // ✅ no object selected yet
            this.objectSearchKey &&                // ✅ user typed something
            this.objectSearchKey.length >= 3 &&    // ✅ minimum chars
            this.filteredObjects &&
            this.filteredObjects.length > 0        // ✅ has matches
        );
    }

    get isRunDisabled() {
        return !this.soqlText || !this.soqlText.trim();
    }

    get tableData() {
        const source = this.filteredData !== null
            ? this.filteredData
            : this.data;

        const start = this.offset;
        const end = start + this.pageSize;

        return source.slice(start, end);
    }

    @wire(getObjects)
    wiredObjects({ data }) {
        if (data) {
            this.allObjects = data.map(o => ({
                label: o.label,       // ✅ clean label
                apiName: o.apiName    // ✅ explicit apiName
            }));
        }
    }

    handleObjectSearch(event) {
        const value = event.target?.value;

        if (!value) {
            this.clearAll(false);
            return;
        }

        this.objectSearchKey = value.toLowerCase();

        if (this.objectSearchKey.length < 3) {
            this.filteredObjects = [];
            return;
        }

        // ✅ Defensive filtering
        
        this.filteredObjects = this.allObjects.filter(obj =>
            (obj.label && obj.label.toLowerCase().includes(this.objectSearchKey)) ||
            (obj.apiName && obj.apiName.toLowerCase().includes(this.objectSearchKey))
        );
    }

    /*handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.selectedFields = [];
        this.data = null;
        this.offset = 0;

        getFields({ objectName: this.selectedObject })
            .then(fields => {
                this.fieldOptions = fields.map(f => ({
                    label: `${f.label} (${f.apiName})`,
                    value: f.apiName
                }));
            });
    }*/

    selectObject(event) {
        const apiName = event.currentTarget?.dataset?.api;
        if (!apiName) {
            console.error('Object API name missing');
            return;
        }

        this.selectedObject = apiName;
        this.objectSearchKey = apiName;
        this.filteredObjects = [];
        this.selectedFields = [];
        this.data = null;
        this.offset = 0;
        this.isSoqlManuallyEdited = false; 

        getFields({ objectName: this.selectedObject })
            .then(fields => {

                // ✅ Sort alphabetically by FIELD LABEL
                const sortedFields = [...fields].sort(
                    (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
                );

                // ✅ Build dual-listbox options
                this.fieldOptions = sortedFields.map(f => ({
                    label: `${f.label} (${f.apiName})`,
                    value: f.apiName
                }));
                this.syncSoqlText();
            })
            .catch(err => {
                console.error('Error loading fields', err);
            });
    }

    handleFieldChange(event) {
        const newFields = event.detail.value;
        if (this.selectedFields.join(',') !== newFields.join(',')) {
            this.selectedFields = newFields;
            this.isSoqlManuallyEdited = false;
        }
        this.syncSoqlText();
    }

    handleWhereChange(event) {
        const newWhereClause = event.detail.value;
        if (this.whereClause !== newWhereClause) {
            this.whereClause = newWhereClause;
            this.isSoqlManuallyEdited = false;
        }
        this.syncSoqlText();
    }

    handleLimitChange(event) {
        let value = Number(event.target.value);
    
        // ✅ Salesforce SOQL hard cap
        const MAX_SOQL_LIMIT = 50000;

        if (value > MAX_SOQL_LIMIT) {
            value = MAX_SOQL_LIMIT;
        }

        // 2. CHECK: Only proceed if the value has actually changed
        if (value !== this.limitSize) {
            this.limitSize = value;
            this.isSoqlManuallyEdited = false;
        }

        // ✅ Only rule: pageSize must not exceed limit
        /*if (this.pageSize > this.limitSize) {
            this.pageSize = this.limitSize;
        }*/

        this.offset = 0;
        this.syncSoqlText();
        //this.generateSoqlFromSelections();
    }

    generateSoqlFromSelections() {
        const fields = (this.selectedFields && this.selectedFields.length) ? this.selectedFields.join(', ') : 'Id';
        const from = this.selectedObject || 'Account';
        const where = this.whereClause ? ` WHERE ${this.whereClause}` : '';
        const limit = this.limitSize ? ` LIMIT ${this.limitSize}` : '';
        return `SELECT ${fields} FROM ${from}${where}${limit}`;
    }


    runQuery() {  
        // ✅ RESET ALL UI STATE BEFORE RUNNING QUERY
        this.data = [];
        this.filteredData = null;
        this.selectedRows = [];
        this.selectedRowIds = [];
        this.offset = 0;
        this.soqlErrorMessage = null;
        this.soqlWarningMessage = null;
        
        // ✅ RAW SOQL MODE -> If SOQL textbox have value
        if (this.soqlText && this.soqlText.trim()) {
            const executionSoql = this.soqlText && this.soqlText.trim();
            
            runRawQuery({ soql: executionSoql })
                .then(result => {
                    // ✅ No data found → show warning
                    if (!result || result.length === 0) {
                        this.data = [];
                        this.columns = [];
                        this.soqlWarningMessage = 'No data found.';
                        this.addToHistory(executionSoql);
                        return;
                    }
                    // ✅ Data exists
                    this.soqlErrorMessage = null;
                    // ✅ FIX: Pass the query string (executionSoql), not the record results (result)
                    this.addToHistory(executionSoql);
                    this.processResults(result);
                })
                .catch(error => {
                    this.data = [];
                    this.filteredData = null;

                    // ✅ Extract readable SOQL error
                    this.soqlErrorMessage =
                        error?.body?.message ||
                        error?.message ||
                        'Invalid SOQL query';
                });

            return;
        }

        // ✅ BUILDER MODE
        if (!this.selectedObject || !this.selectedFields.length) {
            console.warn('Object or fields missing');
            return;
        }

        this.offset = 0;
        this.executeQuery();
    }


    executeQuery() {
        const remaining = this.limitSize - this.offset;
        const effectiveLimit = Math.min(this.pageSize, remaining);

        runQuery({
            objectName: this.selectedObject,
            fields: this.selectedFields,
            whereClause: this.whereClause ? this.whereClause.trim() : null,
            limitSize: effectiveLimit,
            offsetVal: this.offset
        })
        .then(result => {

            // ✅ Build data rows
            this.data = result.map(row => {
                const newRow = { ...row };

                this.selectedFields.forEach(field => {
                    const value = row[field];

                    // ✅ CASE 1: Salesforce record Id (lookup, Id, etc.)
                    if (this.isSalesforceId(value)) {
                        newRow[`${field}_url`] = `/lightning/r/${value}/view`;
                    }

                    // ✅ CASE 2: External CMP URL
                    /*if (field === 'URL_ID__c' && value) {
                        newRow[`${field}_url`] =
                            `${CMP_BASE_URL}/library/${value}/detail`;
                    }

                    // ✅ Case 3: CMP Study Plan Name → external CMP URL
                    if (
                        this.selectedObject === 'CMP_Study_Plan__c' && field === 'Name' && value) {
                        newRow[`${field}_url`] =
                            `${CMP_BASE_URL}/central-monitoring-plans/${value}/detail`;
                    }*/
                    // ✅ Capture the query generated by the builder
                    if (this.soqlText) {
                        this.addToHistory(this.soqlText);
                    }
                });

                return newRow;
            });

            // ✅ Build columns
            this.columns = this.selectedFields.map(field => {

                const isUrlColumn = this.data.some(r => r[`${field}_url`]);

                if (isUrlColumn) {
                    return {
                        label: field,
                        fieldName: `${field}_url`,
                        type: 'url',
                        typeAttributes: {
                            label: { fieldName: field },
                            target: '_blank'
                        }
                    };
                }

                return {
                    label: field,
                    fieldName: field
                };
            });

        
        
        })
        .catch(error => {
            console.error('Query error:', error);
        });
    }
    
    nextPage() {
        if (this.offset + this.pageSize < this.totalRecords) {
            this.offset += this.pageSize;
        }
    }

    prevPage() {
        this.offset = Math.max(0, this.offset - this.pageSize);
    }

    handlePageSizeChange(event) {
        let value = Number(event.target.value);

        if (!value || value < 1) value = 1;
        if (value > this.limitSize) value = this.limitSize;

        this.pageSize = value;
        this.offset = 0;
        this.syncSoqlText();
        this.executeQuery();
    }

    isSalesforceId(value) {
        if (!value || typeof value !== 'string') {
            return false;
        }
        return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(value);
    }

    handleGlobalSearch(event) {         
        const searchKey = event.target.value?.toLowerCase();
        this.globalSearchKey = searchKey;

        if (!searchKey) {
            this.filteredData = null;
            this.offset = 0;
            return;
        }

        const columns = this.columns.map(col => col.label);

        this.filteredData = this.data.filter(row =>
            columns.some(col => {
                const value = row[col];
                return value && String(value).toLowerCase().includes(searchKey);
            })
        );
        this.offset = 0;
    }
    
    /* ---------- ✅ SOQL GENERATION (ADDED) ---------- */

    buildSoqlFromBuilder() {
        if (!this.selectedObject || !this.selectedFields.length) {
            return '';
        }

        let soql =
            `SELECT ${this.selectedFields.join(', ')} FROM ${this.selectedObject}`;

        if (this.whereClause && this.whereClause.trim()) {
            soql += ` WHERE ${this.whereClause.trim()}`;
        }

        // ✅ ONLY user-entered LIMIT
        if(this.limitSize > 0 && !this.isSoqlManuallyEdited) {
            soql += ` LIMIT ${this.limitSize}`;
        }

        return soql;
    }

    syncSoqlText() {
    // ✅ Update SOQL ONLY if user has NOT manually edited it
    if (!this.isSoqlManuallyEdited) {
        const generated = this.buildSoqlFromBuilder();
        if (generated) {
                this.soqlText = generated;
            }
        }
    }

    handleSoqlChange(event) {
        //this.soqlText = event.detail.value;
        const raw = event.target.value || '';
        // Option A: update live as user types
        // this.soqlText = this.titleCasePreserveQuotes(raw);

        // Option B (recommended): update on blur to avoid interfering with typing
        this.soqlText = raw;
        this.isSoqlManuallyEdited = true;

        // ✅ Always clear messages when user edits
        this.soqlErrorMessage = null;
        this.soqlWarningMessage = null;

        // ✅ If SOQL is empty, ensure messages stay cleared
        if (!this.soqlText || !this.soqlText.trim()) {
            this.soqlErrorMessage = null;
            this.soqlWarningMessage = null;
        }
    }

    // call this on blur to transform text
    handleSoqlBlur() {
        this.soqlText = this.transformSoql(this.soqlText || '');
    }

    /**
     * Main transformer:
     * - preserves quoted literals
     * - uppercases keywords
     * - title-cases field/object identifiers (segments separated by '.' or '_' )
     */
    transformSoql(text) {
        if (!text) return text;

        // sort keywords by length desc so multi-word keywords are replaced first
        const keywords = [...SOQL_KEYWORDS].sort((a, b) => b.length - a.length);

        // split into quoted and non-quoted segments (single quotes)
        const segments = text.match(/'[^']*'|[^']+/g) || [];

        const transformed = segments.map(seg => {
        // quoted literal -> return as-is
        if (seg.startsWith("'") && seg.endsWith("'")) {
            return seg;
        }

        // 1) Uppercase keywords in this non-quoted segment
        let out = seg;
        for (const kw of keywords) {
            // allow flexible whitespace for multi-word keywords (e.g., ORDER BY)
            const pattern = '\\b' + kw.replace(/\s+/g, '\\s+') + '\\b';
            const re = new RegExp(pattern, 'gi');
            out = out.replace(re, match => kw.toUpperCase());
        }

        // 2) Title-case field/object identifiers
        // Match tokens that look like identifiers possibly with dots and underscores.
        // This regex finds sequences of letters/digits/underscore/dot that are not part of numbers or operators.
        // It will match things like Account, account.name, metric_type__c, custom__r.Related_Field__c
        const identifierRe = /\b([A-Za-z_][A-Za-z0-9_]*(?:__(?:c|r))?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:__(?:c|r))?)*)\b/g;

        out = out.replace(identifierRe, (match) => {
            // If the match is a keyword (e.g., COUNT) skip title-casing
            const upperMatch = match.toUpperCase();
            if (keywords.includes(upperMatch)) {
            return upperMatch; // ensure keyword is uppercase
            }

            // If match contains parentheses or digits-only, skip (safety)
            if (/^\d+$/.test(match)) return match;

            // Title-case each dot-separated segment, preserving __c/__r suffix
            const parts = match.split('.');
            const transformedParts = parts.map(part => {
            // handle suffixes like __c or __r
            const suffixMatch = part.match(/(.*?)(__c|__r)$/i);
            if (suffixMatch) {
                const base = suffixMatch[1];
                const suffix = suffixMatch[2]; // keep suffix as-is (lowercase or original)
                return this.titleCaseIdentifier(base) + suffix;
            }
            return this.titleCaseIdentifier(part);
            });

            return transformedParts.join('.');
        });

        return out;
        });

        return transformed.join('');
    }

    // Helper: Title-case an identifier part (split on underscores, capitalize first letter of each chunk)
    titleCaseIdentifier(identifier) {
        // If identifier is all uppercase (like ID), convert to Id (first letter uppercase, rest lowercase)
        if (/^[A-Z0-9_]+$/.test(identifier)) {
        const lower = identifier.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
        }

        // Split on underscores and capitalize each chunk's first letter
        return identifier.split('_').map(chunk => {
        if (!chunk) return chunk;
        return chunk.charAt(0).toUpperCase() + chunk.slice(1);
        }).join('_');
    }

    processResults(result) {
  if (!result || !result.length) {
    this.data = [];
    this.columns = [];
    return;
  }

  // 1) Flatten rows with child-array handling
  const flattenedRows = result.map(r => this.flattenResultRowForDisplay(r));

  // 2) Collect keys and build column order (you can prefer SELECT order if you have it)
  const allKeys = new Set();
  flattenedRows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));

  const keyOrder = Array.from(allKeys); // simple order; refine if needed

  // 3) Ensure every row has all keys (datatable expects consistent fields)
  this.data = flattenedRows.map(row => {
    const newRow = {};
    keyOrder.forEach(k => newRow[k] = row[k] ?? '');
    // URL enrichment if needed (reuse your isSalesforceId)
    Object.keys(newRow).forEach(field => {
      const value = newRow[field];
      if (this.isSalesforceId && this.isSalesforceId(value)) {
        newRow[`${field}_url`] = `/lightning/r/${value}/view`;
      }
    });
    return newRow;
  });

  // 4) Build columns (if you created __count fields, you can hide or show them)
  this.columns = keyOrder.map(key => {
    const hasUrl = this.data.some(r => r[`${key}_url`]);
    if (hasUrl) {
      return {
        label: key,
        fieldName: `${key}_url`,
        type: 'url',
        typeAttributes: { label: { fieldName: key }, target: '_blank' }
      };
    }
    return { label: key, fieldName: key };
  });
}

    extractSelectFields(soql) {
        if (!soql) {
            return [];
        }

        // ✅ Match SELECT ... FROM across multiple lines
        const match = soql.match(/select\s+([\s\S]*?)\s+from/i);

        if (!match) {
            return [];
        }

        return match[1]
            .split(',')
            .map(f => f.trim())
            .filter(f => f && !f.match(/\b(count|sum|avg|min|max)\s*\(/i));
    }

    getDeepValueIgnoreCase(obj, path) {
        if (!obj || !path) return null;

        const parts = path.split('.');
        let current = obj;

        for (let part of parts) {
            if (!current || typeof current !== 'object') {
                return null;
            }

            const key = Object.keys(current)
                .find(k => k.toLowerCase() === part.toLowerCase());

            if (!key) {
                return null;
            }

            current = current[key];
        }

        return current;
    }

   // Flatten a single result row and convert child arrays to readable strings
flattenResultRowForDisplay(raw) {
  const out = {};

  const recurse = (obj, prefix = '') => {
    if (obj === null || obj === undefined) return;

    // primitives
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      // arrays handled below
      out[prefix] = obj;
      return;
    }

    Object.keys(obj).forEach(k => {
      if (k === 'attributes') return; // skip REST attributes wrapper
      const val = obj[k];
      const newKey = prefix ? `${prefix}.${k}` : k;

      if (val === null || val === undefined) {
        out[newKey] = val;
      } else if (Array.isArray(val)) {
        // Child relationship (subquery) — convert to readable string
        if (val.length === 0) {
          out[newKey] = '';
        } else {
          // If children are objects and have Name, join names
          const areObjects = val.every(item => item && typeof item === 'object');
          if (areObjects) {
            const names = val.map(child => {
              // prefer Name, fallback to Id or JSON
              if (child.Name !== undefined && child.Name !== null) return child.Name;
              if (child.Id !== undefined && child.Id !== null) return child.Id;
              // fallback: stringify minimal fields
              try {
                return JSON.stringify(child);
              } catch (e) {
                return String(child);
              }
            }).filter(Boolean);
            out[newKey] = names.join(', ');
            // also expose a count if you want: newKey + '__count'
            //out[`${newKey}__count`] = val.length;
          } else {
            // array of primitives
            out[newKey] = val.join(', ');
          }
        }
      } else if (typeof val === 'object') {
        // nested object -> recurse
        recurse(val, newKey);
      } else {
        out[newKey] = val;
      }
    });
  };

  recurse(raw, '');

  // Deduplicate nested X.Id when top-level XId exists and values match
  Object.keys(out).forEach(key => {
    const m = key.match(/^(.+)\.Id$/i);
    if (!m) return;
    const prefix = m[1];                 // "Account"
    const altKey = `${prefix}Id`;       // "AccountId"
    const topKey = Object.keys(out).find(k => k.toLowerCase() === altKey.toLowerCase());
    if (topKey && out[topKey] !== undefined && out[topKey] === out[key]) {
      delete out[key];
    }
  });

  return out;
}



    /* ---------- ROW SELECTION ---------- */

    
    handleRowSelection(event) {
        this.selectedRows = event.detail.selectedRows || [];
        this.selectedRowIds = this.selectedRows
            .filter(r => r.Id)
            .map(r => r.Id);
    }

    get isDeleteDisabled() {
        return !this.selectedRowIds || this.selectedRowIds.length === 0;
    }

    handleDelete() {
    if (!this.selectedRowIds.length) {
        return;
    }

    deleteRecords({ recordIds: this.selectedRowIds })
        .then(() => {
            // Remove deleted rows from UI
            this.data = this.data.filter(
                row => !this.selectedRowIds.includes(row.Id)
            );
            this.selectedRowIds = [];
            this.selectedRows = [];

            // ✅ SUCCESS BANNER
            this.showToast(
                'Delete Successful',
                'Selected records were deleted successfully.',
                'success'
            );

        })
        .catch(error => {
            this.showToast(
                'Delete Failed',
                error?.body?.message || 'Unable to delete records.',
                'error'
            );

            console.error('Delete failed', error);
        });
    }

    handleDeleteAllClick() {
        if (!this.soqlText || !this.soqlText.trim()) {
            this.showToast(
                'No Query',
                'Please run or enter a query before deleting.',
                'warning'
            );
            return;
        }

        this.showDeleteAllModal = true;
    }

    closeDeleteAllModal() {
        this.showDeleteAllModal = false;
    }

    confirmDeleteAll() {
        this.showDeleteAllModal = false;

        deleteAllByQuery({ soql: this.soqlText.trim() })
            .then(count => {
                this.data = [];
                this.filteredData = null;
                this.selectedRows = [];
                this.selectedRowIds = [];
                this.offset = 0;

                this.showToast(
                    'Delete Successful',
                    `${count} record(s) deleted successfully.`,
                    'success'
                );
            })
            .catch(error => {
                this.showToast(
                    'Delete Failed',
                    error?.body?.message || 'Unable to delete records.',
                    'error'
                );
            });
    }

    handleReset(){
        // user clicked Reset button -> reset and show toast
        this.clearAll(true);
    }

    clearAll(showToast=false) {
        this.selectedObject = null;
        this.objectSearchKey = '';
        this.filteredObjects = [];
        this.fieldOptions = [];
        this.selectedFields = [];
        this.whereClause = '';
        this.soqlText = '';
        this.isSoqlManuallyEdited = false;
        this.data = [];
        this.columns = [];
        this.offset = 0;
        this.selectedRowIds = [];                
        this.filteredData = null;       
        this.selectedRows = [];

        // ✅ SUCCESS BANNER
        if (showToast) {
            this.showToast(
                'Reset Successful',
                'Filters and selections have been reset to defaults.',
                'success'
            );
        }
    }

    /* ---------- EXPORT ---------- */

    handleExport() {
        if (!this.data || !this.data.length || !this.columns || !this.columns.length) {
            return;
        }

        // 1️⃣ Determine visible columns
        const visibleColumns = this.columns.map(col => {
            if (
                col.type === 'url' &&
                col.typeAttributes &&
                col.typeAttributes.label &&
                col.typeAttributes.label.fieldName
            ) {
                return {
                    header: col.label,
                    valueField: col.typeAttributes.label.fieldName
                };
            }
            return {
                header: col.label,
                valueField: col.fieldName
            };
        });

        // 2️⃣ Headers
        const headers = visibleColumns.map(c => c.header);

        // 3️⃣ Rows
        const rows = this.data.map(row =>
            visibleColumns.map(col =>
                (row[col.valueField] !== undefined && row[col.valueField] !== null
                    ? String(row[col.valueField])
                    : '')
            )
        );

        // 4️⃣ Call Apex
        exportToExcel({ headers, rows })
            .then(base64Data => {
                // ✅ DATA URL (browser-safe)
                const dataUrl =
                    'data:application/vnd.ms-excel;base64,' + base64Data;
                
                // ✅ Generate navigable URL
                this[NavigationMixin.Navigate]({
                    type: 'standard__webPage',
                    attributes: {
                        url: dataUrl
                    }
                });

                // ✅ SUCCESS BANNER
                this.showToast(
                    'Export Successful',
                    'Excel file has been downloaded.',
                    'success'
                );
            })
            .catch(error => {
                this.showToast(
                    'Export Failed',
                    error?.body?.message || 'Unable to export data.',
                    'error'
                );

                console.error('Excel export failed', error);
            });
    }

    /* ---------- COPY ---------- */

    handleCopy() {
        const tableData = this.tableData;

        if (
            !tableData ||
            !tableData.length ||
            !this.columns ||
            !this.columns.length
        ) {
            return;
        }

        // 1️⃣ Determine visible columns (ignore helper _url fields)
        const visibleColumns = this.columns.map(col => {
            // URL column → display value comes from label field
            if (
                col.type === 'url' &&
                col.typeAttributes &&
                col.typeAttributes.label &&
                col.typeAttributes.label.fieldName
            ) {
                return {
                    header: col.label,
                    valueField: col.typeAttributes.label.fieldName
                };
            }

            // Normal column
            return {
                header: col.label,
                valueField: col.fieldName
            };
        });

        // 2️⃣ Build header row
        const headers = visibleColumns.map(c => c.header);

        // 3️⃣ Build data rows (tab-separated, Excel-friendly)
        const rows = tableData.map(row =>
            visibleColumns.map(col => {
                const value = row[col.valueField];
                return value !== undefined && value !== null
                    ? String(value).replace(/\t/g, ' ')
                    : '';
            }).join('\t')
        );

        const textToCopy =
            headers.join('\t') + '\n' + rows.join('\n');

        // 4️⃣ Try modern Clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    console.log('Copied using clipboard API');
                })
                .catch(() => {
                    // Fallback if clipboard API fails
                    this.fallbackCopy(textToCopy);
                });
                // ✅ SUCCESS BANNER
                this.showToast(
                    'Copied to Clipboard',
                    'Records copied successfully. You can paste them into Excel.',
                    'success'
                );
        } else {
            // Fallback for Locker / older browsers
            this.fallbackCopy(textToCopy);

            // ✅ SUCCESS BANNER
            this.showToast(
                'Copied to Clipboard',
                'Records copied successfully. You can paste them into Excel.',
                'success'
            );
        }
    }

    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.left = '-1000px';

        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
            console.log('Copied using fallback method');
        } catch (err) {
            console.error('Fallback copy failed', err);
        }

        document.body.removeChild(textarea);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

}
