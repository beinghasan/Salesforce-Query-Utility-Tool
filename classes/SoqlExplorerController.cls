public with sharing class SoqlExplorerController {

    /* ---------------- DTOs ---------------- */

    public class ObjectInfo {
        @AuraEnabled public String label;
        @AuraEnabled public String apiName;
        public ObjectInfo(String l, String a) {
            label = l; apiName = a;
        }
    }

    public class FieldInfo {
        @AuraEnabled public String label;
        @AuraEnabled public String apiName;
        @AuraEnabled public Boolean isLookup;
        @AuraEnabled public String relationshipName;
        @AuraEnabled public String referenceTo; // Stores target parent API Name

        public FieldInfo(String l, String a, Boolean isL, String rName, String refTo) {
            this.label = l; 
            this.apiName = a;
            this.isLookup = isL;
            this.relationshipName = rName;
            this.referenceTo = refTo;
        }
    }

    /* ---------------- OBJECTS ---------------- */

    @AuraEnabled(cacheable=true)
    public static List<ObjectInfo> getObjects() {
        List<ObjectInfo> res = new List<ObjectInfo>();
        for (Schema.SObjectType s : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult d = s.getDescribe();
            if (d.isQueryable()) {
                res.add(new ObjectInfo(d.getLabel(), d.getName()));
            }
        }
        return res;
    }

    /* ---------------- FIELDS ---------------- */

    @AuraEnabled(cacheable=true)
    public static List<FieldInfo> getFields(String objectName) {
        List<FieldInfo> res = new List<FieldInfo>();
        Schema.SObjectType obj = Schema.getGlobalDescribe().get(objectName);

        if (obj == null) return res;

        for (Schema.SObjectField f : obj.getDescribe().fields.getMap().values()) {
            Schema.DescribeFieldResult d = f.getDescribe();
            
            // Identify if the field is a reference type (Lookup / Master-Detail)
            Boolean isLookup = (d.getType() == Schema.DisplayType.REFERENCE);
            String relName = d.getRelationshipName();
            String refToName = '';

            // If it's a relationship field, extract its target parent Object API Name
            if (isLookup && d.getReferenceTo().size() > 0) {
                refToName = d.getReferenceTo()[0].getDescribe().getName();
            }

            res.add(new FieldInfo(
                d.getLabel(), 
                d.getName(), 
                isLookup, 
                relName, 
                refToName
            ));
        }
        return res;
    }

    /* ---------------- QUERY ---------------- */

    @AuraEnabled
    public static List<Map<String, Object>> runQuery(
        String objectName,
        List<String> fields,
        String whereClause,
        Integer limitSize,
        Integer offsetVal
    ) {
        if (String.isBlank(objectName) || fields.isEmpty()) {
            throw new AuraHandledException('Object and fields required');
        }

        limitSize = (limitSize == null || limitSize > 200) ? 200 : limitSize;
        offsetVal = offsetVal == null ? 0 : offsetVal;

        Set<String> fieldSet = new Set<String>(fields);
        fieldSet.add('Id'); // Required for datatable

        String soql = 'SELECT ' + String.join(new List<String>(fieldSet), ',') + ' FROM ' + objectName;

        if (String.isNotBlank(whereClause)) {
            String lc = whereClause.toLowerCase();
            if (lc.contains('select') || lc.contains('from')) {
                throw new AuraHandledException('WHERE clause should not contain SELECT or FROM');
            }
            soql += ' WHERE ' + whereClause;
        }

        soql += ' LIMIT ' + limitSize + ' OFFSET ' + offsetVal;

        List<SObject> records = Database.query(soql);

        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (SObject s : records) {
            rows.add(s.getPopulatedFieldsAsMap());
        }
        return rows;
    }

    
    /* ---------- RAW SOQL EXECUTION ---------- */
    @AuraEnabled
    public static List<Map<String, Object>> runRawQuery(String soql) {
        if (String.isBlank(soql)) {
            throw new AuraHandledException('SOQL cannot be empty');
        }

        if (!soql.trim().toLowerCase().startsWith('select')) {
            throw new AuraHandledException('Only SELECT queries are allowed');
        }

        List<SObject> records = Database.query(soql);

        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (SObject s : records) {
            rows.add(s.getPopulatedFieldsAsMap());
        }
        return rows;
    }

    /*---------Delete based on row selection---------*/

    @AuraEnabled
    public static void deleteRecords(List<Id> recordIds) {
        if (recordIds == null || recordIds.isEmpty()) {
            return;
        }

        // ✅ This is the correct, Salesforce-supported approach
        Database.delete(recordIds, false);
    }

    /*---------Bulk Delete---------*/

    @AuraEnabled
    public static Integer deleteAllByQuery(String soql) {
        if (String.isBlank(soql)) {
            throw new AuraHandledException('SOQL query is required');
        }

        String lower = soql.toLowerCase();

        if (!lower.startsWith('select')) {
            throw new AuraHandledException('Only SELECT queries are allowed');
        }

        if (lower.contains('group by')) {
            throw new AuraHandledException(
                'Delete All is not supported for aggregate queries.'
            );
        }

        // Remove ORDER BY, LIMIT, OFFSET
        soql = soql.replaceAll('(?i)order\\s+by[\\s\\S]*$', '');
        soql = soql.replaceAll('(?i)limit\\s+\\d+', '');
        soql = soql.replaceAll('(?i)offset\\s+\\d+', '');

        List<SObject> records = Database.query(soql);

        if (records.isEmpty()) {
            return 0;
        }

        Database.DeleteResult[] results =
            Database.delete(records, false);

        Integer successCount = 0;
        for (Database.DeleteResult dr : results) {
            if (dr.isSuccess()) {
                successCount++;
            }
        }

        return successCount;
    }

    /* ===============================
       EXCEL EXPORT
       =============================== */

    @AuraEnabled
    public static String exportToExcel(
        List<String> headers,
        List<List<String>> rows
    ) {
        String xml =
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
            'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
            'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
            'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
            '<Worksheet ss:Name="Query Results">' +
            '<Table>';

        // Header row
        xml += '<Row>';
        for (String header : headers) {
            xml += '<Cell><Data ss:Type="String">' +
                escapeXmlValue(header) +
                '</Data></Cell>';
        }
        xml += '</Row>';

        // Data rows
        for (List<String> row : rows) {
            xml += '<Row>';
            for (String cell : row) {
                xml += '<Cell><Data ss:Type="String">' +
                    escapeXmlValue(cell) +
                    '</Data></Cell>';
            }
            xml += '</Row>';
        }

        xml += '</Table></Worksheet></Workbook>';

        // ✅ RETURN BASE64 STRING
        return EncodingUtil.base64Encode(Blob.valueOf(xml));
    }

    /* ===============================
       XML ESCAPE HELPER
       =============================== */

    private static String escapeXmlValue(String value) {
        if (value == null) {
            return '';
        }
        String escaped = value;
        escaped = escaped.replace('&', '&amp;');
        escaped = escaped.replace('<', '&lt;');
        escaped = escaped.replace('>', '&gt;');
        escaped = escaped.replace('"', '&quot;');
        escaped = escaped.replace('\'', '&apos;');
        return escaped;
    }

    @AuraEnabled
    public static void updatePolymorphicFields(Id parentId, Map<String, Object> fieldMap) {
        try {
            // 🟢 Guard against null parentId or payload arguments
            if (parentId == null) {
                throw new AuraHandledException('The Parent Record ID argument cannot be null.');
            }
            if (fieldMap == null || fieldMap.isEmpty()) {
                throw new AuraHandledException('The field update map argument cannot be null or empty.');
            }
            
            // Extract target object type dynamically (e.g., "User", "Contact", "Lead")
            String objectType = parentId.getSObjectType().getDescribe().getName();
            Schema.SObjectType targetType = Schema.getGlobalDescribe().get(objectType);
            
            if (targetType == null) {
                throw new AuraHandledException('Unsupported object type definition: ' + objectType);
            }
            
            // Dynamically instantiate the correct concrete SObject record layout
            SObject targetRecord = targetType.newSObject(parentId);
            Map<String, Schema.SObjectField> sObjectFieldsMap = targetType.getDescribe().fields.getMap();
            
            for (String fieldName : fieldMap.keySet()) {
                if (String.isBlank(fieldName)) {
                    throw new AuraHandledException('Target field name cannot be blank.');
                }
                
                // 🟢 Case-Insensitive Schema Match Lookup Guard
                String verifiedFieldName = null;
                if (sObjectFieldsMap.containsKey(fieldName)) {
                    verifiedFieldName = fieldName;
                } else {
                    // Scan fields case-insensitively to prevent structural mismatches
                    for (String apiName : sObjectFieldsMap.keySet()) {
                        if (apiName.toLowerCase() == fieldName.toLowerCase()) {
                            verifiedFieldName = apiName;
                            break;
                        }
                    }
                }
                
                if (verifiedFieldName != null) {
                    targetRecord.put(verifiedFieldName, fieldMap.get(fieldName));
                } else {
                    throw new AuraHandledException('Field ' + fieldName + ' does not exist on object ' + objectType);
                }
            }
            
            update targetRecord;
            
        } catch (Exception e) {
            throw new AuraHandledException('Polymorphic Save Engine Failure: ' + e.getMessage());
        }
    }

}