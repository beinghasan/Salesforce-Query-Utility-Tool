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
import { updateRecord } from 'lightning/uiRecordApi';
import updatePolymorphicFields from '@salesforce/apex/SoqlExplorerController.updatePolymorphicFields';

// List of SOQL keywords (add/remove as needed)
const SOQL_KEYWORDS = ['ORDER BY', 'GROUP BY', 'HAVING', 'SELECT','FROM', 'WHERE', 'LIMIT', 'OFFSET',
                       'AND', 'OR', 'NOT', 'IN', 'LIKE', 'ASC', 'DESC', 'COUNT_DISTINCT', 'COUNT', 'SUM', 
                       'AVG', 'MIN', 'MAX', 'WITH', 'ROLLUP', 'TYPEOF', 'WHEN', 'END'];

export default class QueryUtility extends NavigationMixin(LightningElement) {

    @track recentQueries = [];
    @track savedQueries = [];
    @track allObjects = [];
    @track filteredObjects = [];
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
    @track isSelectAllChecked = false;
    @track isSelectStandardChecked = false;
    @track isSelectCustomChecked = false;  

    objectSearchKey = '';

    @track limitSize = 200;
    pageSize = 10;
    offset = 0;
    iconLink = ideaIcon;
    developedBy = 'Mehdi Hasan (mehdi.hasan9b@gmail.com)';
    draftValues = [];

    // --- 🔄 RELATIONAL DRILL-DOWN TRACKING ---
    @track currentAvailableFields = []; 
    @track selectedFieldsList = [];      
    @track navStack = [];               
    isFieldsLoading = false;
    @track fieldSearchTerm = '';        // Tracks field search input string dynamically
    @track selectedFieldSearchTerm = '';
    @track isUnselectAllChecked = false;

    get currentObjectName() {
        if (this.navStack.length > 0) {
            return this.navStack[this.navStack.length - 1].objectName;
        }
        return this.selectedObject || 'None';
    }

    get isRootLevel() {
        return this.navStack.length <= 1;
    }

    get isMaxDepthReached() {
        return this.navStack.length >= 5; 
    }

    get navigationPathString() {
        if (this.navStack.length === 0) return 'None';
        return this.navStack.map(node => node.labelPath).join(' > ');
    }

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
        
        this.executeFiltering();
    }

    executeFiltering() {
        const searchKey = this.objectSearchKey.toLowerCase();
        this.filteredObjects = this.allObjects.filter(obj =>
            (obj.label && obj.label.toLowerCase().includes(searchKey)) ||
            (obj.apiName && obj.apiName.toLowerCase().includes(searchKey))
        );
    }

    handleInputClick(event) {
        event.stopPropagation();
        this.selectedObject = '';
        // When clicking back into the box, evaluate whatever text is currently there
        if (this.objectSearchKey && this.objectSearchKey.length >= 3) {
            this.executeFiltering();
        }
    }

    selectObject(event) {
        const apiName = event.currentTarget?.dataset?.api;
        const label = event.currentTarget?.innerText?.split(' (')[0] || apiName;
        if (!apiName) {
            console.error('Object API name missing');
            return;
        }

        this.selectedObject = apiName;
        this.objectSearchKey = apiName;
        this.filteredObjects = [];
        
        this.selectedFieldsList = [];
        this.selectedFields = []; 
        this.data = null;
        this.offset = 0;
        this.isSoqlManuallyEdited = false; 

        this.navStack = [{
            objectName: apiName,
            relationshipPath: '', 
            labelPath: label
        }];

        this.loadFieldsForCurrentLevel();
    }

    loadFieldsForCurrentLevel() {
        if (this.navStack.length === 0) return;
        
        const currentLevel = this.navStack[this.navStack.length - 1];
        this.isFieldsLoading = true;

        getFields({ objectName: currentLevel.objectName })
            .then(fields => {
                const sortedFields = [...fields].sort((a, b) => 
                    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
                );

                this.currentAvailableFields = sortedFields.map(f => {
                    const prefix = currentLevel.relationshipPath;
                    
                    // Build path segment calculation match logic
                    let runtimeFieldPath = '';
                    if (this.isRootLevel) {
                        runtimeFieldPath = f.apiName;
                    } else {
                        const pathSegments = [];
                        for (let i = 1; i < this.navStack.length; i++) {
                            pathSegments.push(this.navStack[i].relationshipPath.split('.').pop());
                        }
                        pathSegments.push(f.apiName);
                        runtimeFieldPath = pathSegments.join('.');
                    }

                    const refObj = Array.isArray(f.referenceTo) ? f.referenceTo[0] : f.referenceTo;
                    
                    // Crucial backup mapping: if Apex doesn't mark isLookup but has reference targets, treat it as a lookup
                    const isLookupField = f.isLookup || !!f.relationshipName || !!refObj;

                    // Compute row css styling if item exists inside selections
                    const isSelected = this.selectedFieldsList.includes(runtimeFieldPath);
                    const rowClass = isSelected ? 'slds-item slds-grid slds-grid_vertical-align-center slds-p-around_xx-small hover-row selected-field-highlight' : 'slds-item slds-grid slds-grid_vertical-align-center slds-p-around_xx-small hover-row';

                    return {
                        ...f,
                        fullPath: runtimeFieldPath,
                        isLookup: isLookupField,
                        referenceTo: refObj || (f.apiName.endsWith('Id') ? f.apiName.replace(/Id$/, '') : ''),
                        relationshipName: f.relationshipName || (f.apiName.endsWith('Id') ? f.apiName.replace(/Id$/, '') : ''),
                        rowClass: rowClass
                    };
                });
                this.isFieldsLoading = false;
            })
            .catch(err => {
                console.error('Error loading fields', err);
                this.isFieldsLoading = false;
            });
    }

    handleFieldSearchChange(event) {
        // If empty (no inputs or user clicked the cross icon), it sets search term back to ''
        this.fieldSearchTerm = event.target.value ? event.target.value.toLowerCase().trim() : '';
    }

    get filteredAvailableFields() {
        if (!this.currentAvailableFields) return [];
        
        // State A: If search input is blank, show all elements by default
        if (!this.fieldSearchTerm) {
            return this.currentAvailableFields;
        }

        // State B: User typed a search key -> Filter based on label or apiName matching
        return this.currentAvailableFields.filter(field => {
            const labelMatch = field.label ? field.label.toLowerCase().includes(this.fieldSearchTerm) : false;
            const apiMatch = field.apiName ? field.apiName.toLowerCase().includes(this.fieldSearchTerm) : false;
            
            return labelMatch || apiMatch;
        });
    }

    handleDrillDown(event) {
        event.stopPropagation();
        if (this.isMaxDepthReached) return;

        const relName = event.currentTarget.dataset.relationship;
        const parentObj = event.currentTarget.dataset.parent;
        const fieldLabel = event.currentTarget.title || relName;

        if (!relName || !parentObj) return;

        const currentLevel = this.navStack[this.navStack.length - 1];
        const currentPrefix = currentLevel.relationshipPath;
        const nextPrefix = currentPrefix ? `${currentPrefix}.${relName}` : relName;

        this.navStack.push({
            objectName: parentObj,
            relationshipPath: nextPrefix,
            labelPath: fieldLabel
        });

        this.loadFieldsForCurrentLevel();
        this.fieldSearchTerm = '';
    }

    handleNavigateBack() {
        if (this.isRootLevel) return;
        this.navStack.pop();
        this.loadFieldsForCurrentLevel();
    }

    handleSelectField(event) {
        this.isUnselectAllChecked = false;

        // Safe extraction of dataset attributes
        const rawApiName = event.currentTarget.dataset.api;

        if (!rawApiName) {
            console.error('Field API name is missing from the dataset context.');
            return;
        }
        
        let runtimeFieldPath = '';

        if (this.isRootLevel) {
            runtimeFieldPath = rawApiName;
        } else {
            // Build the exact dot notation relationship path safely
            const pathSegments = [];
            for (let i = 1; i < this.navStack.length; i++) {
                const node = this.navStack[i];
                if (node && node.relationshipPath) {
                    // Extract only the current level segment token accurately
                    const segment = node.relationshipPath.split('.').pop();
                    if (segment) {
                        pathSegments.push(segment);
                    }
                }
            }
            pathSegments.push(rawApiName);
            runtimeFieldPath = pathSegments.join('.');
        }

        // Add or remove selected field path to array
        if (!this.selectedFieldsList.includes(runtimeFieldPath)) {
            this.selectedFieldsList = [...this.selectedFieldsList, runtimeFieldPath];
        } else {
            this.selectedFieldsList = this.selectedFieldsList.filter(f => f !== runtimeFieldPath);
        }

        // Sync with standard reference execution array used by data handlers
        this.selectedFields = [...this.selectedFieldsList]; 
        this.isSoqlManuallyEdited = false;
        
        // Refresh styles & directly update the textarea
        this.refreshRowHighlighting();
        this.syncSoqlText();
    }

    handleRemoveSelectedField(event) {
        const fieldToRemove = event.currentTarget.dataset.field;
        this.selectedFieldsList = this.selectedFieldsList.filter(f => f !== fieldToRemove);
        this.selectedFields = [...this.selectedFieldsList]; 
        this.isSoqlManuallyEdited = false;
        
        this.refreshRowHighlighting();
        this.syncSoqlText();
    }

    refreshRowHighlighting() {
        this.currentAvailableFields = this.currentAvailableFields.map(f => {
            const isSelected = this.selectedFieldsList.includes(f.fullPath);
            return {
                ...f,
                rowClass: isSelected 
                    ? 'slds-item slds-grid slds-grid_vertical-align-center slds-p-around_xx-small hover-row selected-field-highlight' 
                    : 'slds-item slds-grid slds-grid_vertical-align-center slds-p-around_xx-small hover-row'
            };
        });
    }

    // 1. Handle "Select All" Toggle
    handleSelectAllChange(event) {
        const checked = event.target.checked;
        this.isSelectAllChecked = checked;
        
        if (checked) {
            this.isSelectStandardChecked = false;
            this.isSelectCustomChecked = false;
            
            // Push every available field path into selections
            this.selectedFieldsList = this.currentAvailableFields.map(f => f.fullPath);
        } else {
            this.selectedFieldsList = [];
        }
        this.refreshRowHighlighting();
        this.syncSoqlText();
    }

    // 2. Handle "Select Standard" Toggle
    handleSelectStandardChange(event) {
        const checked = event.target.checked;
        this.isSelectStandardChecked = checked;

        if (checked) {
            this.isSelectAllChecked = false;
            this.isSelectCustomChecked = false;
            
            // Filters out fields that end with '__c'
            this.selectedFieldsList = this.currentAvailableFields
                .filter(f => !f.apiName.endsWith('__c'))
                .map(f => f.fullPath);
        } else {
            this.selectedFieldsList = [];
        }
        this.refreshRowHighlighting();
        this.syncSoqlText();
    }

    // 3. Handle "Select Custom" Toggle
    handleSelectCustomChange(event) {
        const checked = event.target.checked;
        
        // 1. Identify all custom fields or custom relationship paths currently available
        const customFields = this.currentAvailableFields.filter(f => 
            (f.apiName && f.apiName.endsWith('__c')) || (f.relationshipName && f.relationshipName.endsWith('__r'))
        );

        if (checked && customFields.length === 0) {
            event.target.checked = false;
            this.isSelectCustomChecked = false;
            this.showToast('Warning', `No custom fields available in ${this.currentObjectName}`, 'warning');
            return;
        }

        this.isSelectCustomChecked = checked;
        
        if (checked) {
            // Turn off competing checkbox states
            this.isSelectAllChecked = false;
            this.isSelectStandardChecked = false;
            this.isUnselectAllChecked = false; // Keep this turned off too
            
            // 2. 🟢 FIX: Use a fresh array reference assignment via spread mapping 
            // to ensure LWC's reactivity engine picks up the change for ALL items
            this.selectedFieldsList = [...customFields.map(f => f.fullPath)];
            
            // 3. 🟢 CRITICAL: If your component uses a parallel array (like this.selectedFields), 
            // keep it synchronized here so the highlight loops match perfectly
            this.selectedFields = [...customFields]; 
        } else {
            this.selectedFieldsList = [];
            this.selectedFields = [];
        }

        // 4. Force synchronization back to your UI layers
        this.refreshRowHighlighting();
        this.syncSoqlText(); // Ensure the SOQL query text area renders all selected custom fields immediately
    }

    // Move items Up/Down inside selections box panel list
    handleMoveUp(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        if (index === 0) return;
        this.swapSelectedElements(index, index - 1);
    }

    handleMoveDown(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        if (index === this.selectedFieldsList.length - 1) return;
        this.swapSelectedElements(index, index + 1);
    }

    swapSelectedElements(indexA, indexB) {
        const arrayCopy = [...this.selectedFieldsList];
        const temp = arrayCopy[indexA];
        arrayCopy[indexA] = arrayCopy[indexB];
        arrayCopy[indexB] = temp;
        
        this.selectedFieldsList = arrayCopy;
        this.selectedFields = [...arrayCopy];
        this.isSoqlManuallyEdited = false;
        this.syncSoqlText();
    }      

    // Handle text parameters typed within the right side search bar
    handleSelectedFieldSearchChange(event) {
        this.selectedFieldSearchTerm = event.target.value ? event.target.value.toLowerCase().trim() : '';
    }

    // 🟢 Master handler when checking 'Unselect All'
    handleUnselectAllChange(event) {
        const checked = event.target.checked;
        this.isUnselectAllChecked = checked;

        if (checked) {
            // Empty lists, clear check flags on the left side, reset tracking arrays
            this.selectedFieldsList = [];
            this.selectedFields = [];
            this.isSelectAllChecked = false;
            this.isSelectStandardChecked = false;
            this.isSelectCustomChecked = false;
            this.isSoqlManuallyEdited = false;

            this.soqlText = ''; 

            // 3. 🟢 HARD SYSTEM OVERRIDE: Directly target the component inside the DOM and wipe it
            const textareaElem = this.template.querySelector('lightning-textarea');
            if (textareaElem) {
                textareaElem.value = ''; // Direct override bypassing reactive diffing bugs
            } else {
                // Check if you are using a standard HTML textarea instead
                const rawTextarea = this.template.querySelector('textarea');
                if (rawTextarea) {
                    rawTextarea.value = '';
                }
            }
            
            // Re-render UI highlights out completely
            this.refreshRowHighlighting();
            this.syncSoqlText();

        }
    }

    get filteredSelectedFields() {
        // Fallback safety check
        if (!this.selectedFieldsList || this.selectedFieldsList.length === 0) {
            return [];
        }
        
        // If there is no search filter text on the right side, show everything selected
        if (!this.selectedFieldSearchTerm) {
            return this.selectedFieldsList;
        }

        // Return filtered list if user is searching their selections
        return this.selectedFieldsList.filter(field => {
            if (typeof field === 'string') {
                return field.toLowerCase().includes(this.selectedFieldSearchTerm);
            } else if (field && field.fullPath) {
                return field.fullPath.toLowerCase().includes(this.selectedFieldSearchTerm);
            }
            return false;
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
        this.data = [];
        this.filteredData = null;
        this.selectedRows = [];
        this.selectedRowIds = [];
        this.offset = 0;
        this.soqlErrorMessage = null;
        this.soqlWarningMessage = null;
        
        if (this.soqlText && this.soqlText.trim()) {
            const executionSoql = this.soqlText.trim();
            
            runRawQuery({ soql: executionSoql })
                .then(result => {
                    if (!result || result.length === 0) {
                        this.data = [];
                        this.columns = [];
                        this.soqlWarningMessage = 'No data found.';
                        this.addToHistory(executionSoql);
                        return;
                    }
                    this.soqlErrorMessage = null;
                    this.addToHistory(executionSoql);

                    // 🟢 EXTRACT FIELDS FROM RAW SOQL STRING
                    // Regex grabs everything between 'SELECT' and 'FROM' case-insensitively
                    // 🟢 UPGRADED FIELD EXTRACTOR INSIDE runQuery()
                    // 🟢 FIXED FIELD EXTRACTOR WITH DEDUPLICATION INSIDE runQuery()
                    const selectMatch = executionSoql.match(/select\s+([\s\S]*?)\s+from/i);
                    let rawFieldsArray = [];

                    if (selectMatch && selectMatch[1]) {
                        const selectClause = selectMatch[1];
                        const fieldRegex = /(?:typeof[\s\S]*?end)|[^,\s][-_\w\.]*/gi;
                        const matches = selectClause.match(fieldRegex) || [];
                        
                        matches.forEach(match => {
                            const cleanMatch = match.trim();
                            if (!cleanMatch) return;
                            
                            if (cleanMatch.toLowerCase().startsWith('typeof')) {
                                const thenMatches = cleanMatch.match(/then\s+([a-z0-9_\.,\s]+?)(?=when|end)/gi) || [];
                                
                                thenMatches.forEach(thenBlock => {
                                    const fields = thenBlock.replace(/then/i, '').split(',');
                                    fields.forEach(f => {
                                        const cleanField = f.trim();
                                        if (cleanField) {
                                            const polymorphicKey = `Owner.${cleanField}`;
                                            
                                            // 🟢 FIX: Only add the field path if it hasn't been extracted yet
                                            if (!rawFieldsArray.includes(polymorphicKey)) {
                                                rawFieldsArray.push(polymorphicKey);
                                            }
                                        }
                                    });
                                });
                            } else {
                                // Standard field entry (e.g., Id, CaseNumber)
                                if (!rawFieldsArray.includes(cleanMatch)) {
                                    rawFieldsArray.push(cleanMatch);
                                }
                            }
                        });
                    }

                    // 2. 🟢 Pass both the result data AND the extracted fields array
                    this.processResults(result, rawFieldsArray);
                })
                .catch(error => {
                    this.data = [];
                    this.filteredData = null;
                    this.soqlErrorMessage = error?.body?.message || error?.message || 'Invalid SOQL query';
                });

            return;
        }

        // BUILDER MODE
        if (!this.selectedObject || !this.selectedFields.length) {
            console.warn('Object or fields missing');
            return;
        }

        this.offset = 0;
        this.executeQuery(); // Make sure your internal executeQuery() also passes this.selectedFields into processResults!
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
        if (!this.selectedObject || !this.selectedFieldsList.length) {
            return '';
        }

        let soql = `SELECT ${this.selectedFieldsList.join(', ')} FROM ${this.selectedObject}`;

        if (this.whereClause && this.whereClause.trim()) {
            soql += ` WHERE ${this.whereClause.trim()}`;
        }

        if (this.limitSize > 0 && !this.isSoqlManuallyEdited) {
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
        this.isUnselectAllChecked = false;
        const rawQuery = event.target.value;
        this.soqlText = rawQuery;
        this.isSoqlManuallyEdited = true; // Flag that user is typing manually

        if (!rawQuery) {
            this.selectedFieldsList = [];
            this.selectedFields = [];
            this.refreshRowHighlighting();
            return;
        }

        try {
            // Clean up string to safely parse out fields
            const cleanQuery = rawQuery.replace(/\s+/g, ' ').trim();
            const selectMatch = cleanQuery.match(/^SELECT\s+(.+?)\s+FROM/i);

            if (selectMatch && selectMatch[1]) {
                // Split by comma and trim spaces or newlines from fields
                const parsedFields = selectMatch[1]
                    .split(',')
                    .map(f => f.trim())
                    .filter(f => f.length > 0);

                // Update internal tracking arrays reactively
                this.selectedFieldsList = [...parsedFields];
                this.selectedFields = [...parsedFields];
            } else {
                // If query is malformed or SELECT/FROM is missing during typing, clear lists safely
                this.selectedFieldsList = [];
                this.selectedFields = [];
            }
        } catch (error) {
            console.error('Error parsing inline SOQL text adjustments:', error);
        }

        // Trigger styles recalculation instantly to drop/add light blue highlights
        this.refreshRowHighlighting();
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

    processResults(result, originalUserSelectedFields) {
        if (!result || !result.length) {
            this.data = [];
            this.columns = [];
            return;
        }

        const flattenedRows = result.map(r => this.flattenResultRowForDisplay(r));

        // 1. Harmonize field matching casing based on what the flattener produced
        const safeFields = Array.isArray(originalUserSelectedFields) ? originalUserSelectedFields : [];
        const firstRowKeys = Object.keys(flattenedRows[0] || {});
        
        let keyOrder = safeFields.map(field => {
            const matchingKey = firstRowKeys.find(k => k.toLowerCase() === field.toLowerCase());
            return matchingKey || field;
        });

        // 2. Map data rows and explicitly inject link URLs for ID fields
        this.data = flattenedRows.map(row => {
            const newRow = { Id: row.Id };
            
            // Copy over all original flattened keys
            Object.keys(row).forEach(key => {
                newRow[key] = row[key];
            });

            // 🟢 URL GENERATION: If a key is an ID field, generate its clickable path
            keyOrder.forEach(key => {
                const value = newRow[key];
                const isIdField = key.toLowerCase() === 'id' || key.toLowerCase().endsWith('id') || key.toLowerCase().endsWith('.id');
                
                if (isIdField && value && (value.length === 15 || value.length === 18)) {
                    // Create a dedicated URL property for this specific column key
                    newRow[`${key}_url`] = `/lightning/r/${value}/view`;
                }
            });
            
            return newRow;
        });

        // 3. Build columns and map them to the generated URL properties
        this.columns = keyOrder.map(key => {
            const isIdField = key.toLowerCase() === 'id' || key.toLowerCase().endsWith('id') || key.toLowerCase().endsWith('.id');
            const hasUrlProperty = this.data.some(r => r[`${key}_url`]);

            // 🟢 FORCE LINK RENDERING: If it's an ID field and has a valid URL path
            if (isIdField && hasUrlProperty) {
                return {
                    label: key,
                    fieldName: `${key}_url`, // Points to the generated URL string
                    type: 'url',
                    typeAttributes: { 
                        label: { fieldName: key }, // Displays the actual 18-character ID text
                        target: '_blank' 
                    }
                };
            }
            
            // Standard data columns
            return { 
                label: key, 
                fieldName: key, 
                type: 'text',
                editable: !isIdField // Prevent editing on ID paths
            };
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

        // 🟢 UPDATE: Handle Polymorphic / Multi-level Key Mapping safely
        // Instead of deleting out[key], keep alternative naming conventions synchronized 
        // so that the UI can find 'Owner.Email' and the Save handler can find 'OwnerId'
        Object.keys(out).forEach(key => {
            const m = key.match(/^(.+)\.Id$/i);
            if (!m) return;
            
            const prefix = m[1];                // e.g., "Owner" or "Account"
            const altKey = `${prefix}Id`;       // e.g., "OwnerId" or "AccountId"
            
            const topKey = Object.keys(out).find(k => k.toLowerCase() === altKey.toLowerCase());
            
            if (topKey && out[topKey] !== undefined) {
                // Ensure the dot notation path stays populated with the ID value
                out[key] = out[topKey];
            } else if (out[key]) {
                // If Salesforce only returns Owner.Id (common in TYPEOF), manufacture 
                // the top-level OwnerId so background lookups work during an inline edit save
                out[altKey] = out[key];
            }
        });

        return out;
    }

    /**
     * 🟢 Prepares the clean background SOQL query with necessary lookup IDs
     */
    prepareBackendQuery(baseObject, selectedFieldsArray) {
        const uniqueFields = new Set(['Id']); 

        // 🟢 FIX: Ensure selectedFieldsArray is an array before attempting to run .forEach
        const safeFieldsArray = Array.isArray(selectedFieldsArray) ? selectedFieldsArray : [];

        safeFieldsArray.forEach(field => {
            uniqueFields.add(field); 

            if (field && field.includes('.')) {
                const parts = field.split('.');
                const relationshipName = parts[parts.length - 2]; 
                const prefixPath = parts.slice(0, -1).join('.'); 
                
                const idFieldName = relationshipName.endsWith('__r') 
                    ? `${relationshipName.slice(0, -3)}__c` 
                    : `${relationshipName}Id`;

                const hiddenLookupField = parts.length > 2 
                    ? `${parts.slice(0, -2).join('.')}.${idFieldName}` 
                    : idFieldName;

                uniqueFields.add(hiddenLookupField);
            }
        });

        const queryFieldsString = Array.from(uniqueFields).join(', ');
        return `SELECT ${queryFieldsString} FROM ${baseObject} LIMIT 200`;
    }

    /* ---------- DATATABLE INLINE EDITING ---------- */

    async handleSave(event) {
        const draftValues = event.detail.draftValues;
        
        // Operational Tracking Maps to group changes by target record ID
        const standardUpdatesMap = new Map();     // Used for UI API updateRecord
        const polymorphicUpdatesMap = new Map();  // Used for Apex imperative call

        draftValues.forEach(draft => {
            const originalRow = this.data.find(row => row.Id === draft.Id);
            if (!originalRow) return;

            Object.keys(draft).forEach(key => {
                if (key === 'Id') return;

                if (key.includes('.')) {
                    const parts = key.split('.'); 
                    const fieldName = parts[parts.length - 1]; 
                    const relationshipPath = parts.slice(0, -1); 
                    const baseRelationship = relationshipPath[0].toLowerCase();

                    // Resolve the target Parent ID dynamically
                    const parentId = this.getParentIdDynamically(originalRow, relationshipPath);
                    if (!parentId) {
                        console.error(`Could not resolve Parent ID for path: ${key}`);
                        return;
                    }

                    // Check if the relationship field path is explicitly Polymorphic
                    const isPolymorphic = baseRelationship === 'owner' || baseRelationship === 'who' || baseRelationship === 'what';

                    if (isPolymorphic) {
                        // Group fields by Polymorphic Parent ID for the Apex method payload
                        if (!polymorphicUpdatesMap.has(parentId)) {
                            polymorphicUpdatesMap.set(parentId, {});
                        }
                        polymorphicUpdatesMap.get(parentId)[fieldName] = draft[key];
                    } else {
                        // Group normal fields for standard updateRecord UI API
                        if (!standardUpdatesMap.has(parentId)) {
                            standardUpdatesMap.set(parentId, { Id: parentId });
                        }
                        // 🟢 FIX: Handle Compound Parent "Name" Fields
                        if (fieldName === 'Name') {
                            const fullName = draft[key] ? draft[key].trim() : '';
                            const nameParts = fullName.split(' ');
                            
                            if (nameParts.length > 1) {
                                standardUpdatesMap.get(parentId)['FirstName'] = nameParts[0];
                                standardUpdatesMap.get(parentId)['LastName'] = nameParts.slice(1).join(' ');
                            } else {
                                // Fallback if only one word is provided (LastName is required on Contact)
                                standardUpdatesMap.get(parentId)['LastName'] = fullName || 'Unknown';
                            }
                        } else {
                            // Standard parent field tracking (e.g., Account.Rating)
                            standardUpdatesMap.get(parentId)[fieldName] = draft[key];
                        }
                    }
                } else {
                    // Standard base record updates (e.g., Case fields)
                    if (!standardUpdatesMap.has(draft.Id)) {
                        standardUpdatesMap.set(draft.Id, { Id: draft.Id });
                    }
                    standardUpdatesMap.get(draft.Id)[key] = draft[key];
                }
            });
        });

        // Generate the combined promise array container
        const promises = [];

        // 1. Append Standard updateRecord UI API Promises
        standardUpdatesMap.forEach((fieldsPayload) => {
            promises.push(updateRecord({ fields: fieldsPayload }));
        });

        // 2. Append Imperative Polymorphic Apex Promises
        polymorphicUpdatesMap.forEach((fieldMap, parentId) => {
            promises.push(updatePolymorphicFields({ parentId: parentId, fieldMap: fieldMap }));
        });

        try {
            if (promises.length === 0) return;

            // Execute all UI API saves and Apex polymorphic saves concurrently
            await Promise.all(promises);

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Record(s) updated successfully.',
                    variant: 'success'
                })
            );

            // Merge local visual cell updates directly back to your UI datatable data provider
            this.data = this.data.map(row => {
                const draftRow = draftValues.find(draft => draft.Id === row.Id);
                return draftRow ? { ...row, ...draftRow } : row;
            });

            // Flush the tracking framework to clear out highlighted yellow modifications indicators
            this.draftValues = [];

        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error updating records',
                    message: error.body?.message || error.message,
                    variant: 'error'
                })
            );
        }
    }

    /**
     * Dynamic Multi-Level Parent ID Resolver
     * Deep scans keys to guarantee it extracts the valid 15/18 character Salesforce ID
     */
    getParentIdDynamically(originalRow, relationshipPath) {
        if (!originalRow || !relationshipPath || relationshipPath.length === 0) return null;

        // Reconstruct the expected relationship paths (e.g., "OwnerId" or "Owner.Id")
        const pathString = relationshipPath.join('.'); // "Owner" or "Account.Parent"
        const primaryTarget = `${pathString}Id`.toLowerCase(); // "ownerid"
        const secondaryTarget = `${pathString}.id`.toLowerCase(); // "owner.id"

        // Find the exact matching key inside the row data case-insensitively
        const exactKey = Object.keys(originalRow).find(key => {
            const lowerKey = key.toLowerCase();
            return lowerKey === primaryTarget || lowerKey === secondaryTarget;
        });

        if (exactKey && originalRow[exactKey]) {
            return originalRow[exactKey];
        }

        // 🟢 ULTIMATE FALLBACK: If standard paths aren't found, look through ALL properties 
        // inside the row for any valid 15 or 18 character Salesforce ID that starts with the base path name
        const basePath = relationshipPath[0].toLowerCase(); // e.g., "owner"
        const fallbackKey = Object.keys(originalRow).find(key => {
            const val = originalRow[key];
            return (
                key.toLowerCase().startsWith(basePath) && 
                val && 
                (val.length === 15 || val.length === 18) && 
                (val.startsWith('00') || val.startsWith('a0'))
            );
        });

        return fallbackKey ? originalRow[fallbackKey] : null;
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

    handleClearEverything() {
        this.selectedFieldsList = [];
        this.selectedFields = [];
        this.data = [];
        this.columns = [];
        this.fieldSearchTerm = '';
        this.selectedFieldSearchTerm = '';
        this.isSelectAllChecked = false;
        this.isSelectStandardChecked = false;
        this.isSelectCustomChecked = false;
        this.isUnselectAllChecked = false;
        this.isSoqlManuallyEdited = false;
        this.soqlText = '';

        const textareaElem = this.template.querySelector('lightning-textarea');
        if (textareaElem) {
            textareaElem.value = '';
        } else {
            const rawTextarea = this.template.querySelector('textarea');
            if (rawTextarea) rawTextarea.value = '';
        }

        this.refreshRowHighlighting();
        this.syncSoqlText();
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
        this.selectedFieldsList = [];
        this.navStack = [];
        this.currentAvailableFields = [];

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