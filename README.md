# SOQL Explorer V2

SOQL Explorer V2 is a Salesforce Lightning Web Component for composing, running, and inspecting SOQL queries directly inside Salesforce. It builds on the original utility experience with a more guided field-selection workflow, relationship drill-down navigation, richer result actions, and safer data management capabilities.

<img width="1469" height="647" alt="Screenshot 2026-07-12 at 4 05 56 AM" src="https://github.com/user-attachments/assets/155592c6-e693-4a59-9b2f-9344d75f677c" />

<img width="1469" height="652" alt="Screenshot 2026-07-12 at 4 09 58 AM" src="https://github.com/user-attachments/assets/2f3622f9-540f-49cc-ae36-f8853a3be4e4" />

<img width="1469" height="705" alt="Screenshot 2026-07-12 at 4 12 47 AM" src="https://github.com/user-attachments/assets/b4bf0b99-04b8-4df2-88d5-56098369b990" />


## Overview

SOQL Explorer V2 helps admins and developers:
- search and select Salesforce objects
- browse fields with filtering and selection helpers
- build queries visually or edit SOQL manually
- run queries and view tabular results
- export, copy, and manage records directly from the UI

## What’s New in V2

This version adds several major enhancements over the original experience:

- Relationship-aware field browsing with drill-down navigation
- Advanced field selection panels with search, select-all, standard/custom filters, and reordering
- A manual SOQL editor with query generation from selected fields and filters
- Rich result table actions including global search, pagination, copy, and Excel export
- Inline row editing support for supported fields
- Polymorphic field update support for relationship-based record edits
- Record deletion and bulk delete workflows
- Saved query and recent history persistence using local storage
- Improved query result flattening for related-child data and relationship paths

## Key Features

### Object and Field Discovery
- Search Salesforce objects by label or API name
- Browse available fields for the selected object
- Filter fields by search term
- Select standard, custom, or all fields
- Drill into lookup relationships and navigate related objects

### Query Building
- Build SOQL through a guided field-selection UI
- Add a WHERE clause manually
- Set a result limit up to the SOQL maximum
- Switch between builder-driven and manually edited query modes
- Save favorite queries and keep a recent history list

### Query Execution and Results
- Run SOQL directly against the org
- Render result rows in a Lightning datatable
- Search results across visible columns
- Move between pages of results
- Copy visible results to the clipboard
- Export results to Excel

### Record Actions
- Select one or more rows for deletion
- Perform bulk delete from a current query result set
- Inline edit supported rows directly in the table
- Support polymorphic relationship updates where applicable

## Component Files

- Lightning Web Component:
  - [force-app/main/default/lwc/soqlExplorer/soqlExplorer.html](force-app/main/default/lwc/soqlExplorer/soqlExplorer.html)
  - [force-app/main/default/lwc/soqlExplorer/soqlExplorer.js](force-app/main/default/lwc/soqlExplorer/soqlExplorer.js)
  - [force-app/main/default/lwc/soqlExplorer/soqlExplorer.css](force-app/main/default/lwc/soqlExplorer/soqlExplorer.css)
  - [force-app/main/default/lwc/soqlExplorer/soqlExplorer.js-meta.xml](force-app/main/default/lwc/soqlExplorer/soqlExplorer.js-meta.xml)
- Apex controller:
  - [force-app/main/default/classes/SoqlExplorerController.cls](force-app/main/default/classes/SoqlExplorerController.cls)
  - [force-app/main/default/classes/SoqlExplorerController.cls-meta.xml](force-app/main/default/classes/SoqlExplorerController.cls-meta.xml)
- Optional tab entry point:
  - [force-app/main/default/tabs/SOQL_Explorer.tab-meta.xml](force-app/main/default/tabs/SOQL_Explorer.tab-meta.xml)

## Prerequisites

- A Salesforce DX or SFDX-compatible project
- An authorized target org via Salesforce CLI
- Permission to query and, where applicable, edit the relevant objects and fields
- The Apex controller deployed and accessible to the running user

## Installation and Deployment

Deploy the component and Apex class using Salesforce CLI:

```bash
sf project deploy start
```

To deploy only the relevant metadata:

```bash
sf project deploy start --metadata "LightningComponentBundle:soqlExplorer,ApexClass:SoqlExplorerController,CustomTab:SOQL_Explorer"
```

Ensure the user has access to:
- the Apex class
- the objects and fields used in queries
- the custom tab if it will be launched from the app launcher

## Adding the Component to Salesforce

You can expose SOQL Explorer V2 in several ways:
- add it to a Lightning App Page
- place it in a Utility Bar
- use the provided custom tab as a direct entry point

## Usage

1. Open SOQL Explorer from the custom tab or from a page where the component is placed.
2. Search for and select an object.
3. Choose fields from the available field list or type a manual SOQL query.
4. Optionally add a WHERE clause and limit.
5. Click Run Query to execute.
6. Review the result table, search it, export it, copy it, or perform delete/edit actions.

Example query:

```sql
SELECT Id, Name, Industry FROM Account ORDER BY Name LIMIT 50
```

## Notes and Limitations

- SOQL governor limits still apply, especially for large or complex result sets.
- Queries must respect object and field permissions for the running user.
- Relationship and polymorphic data may require careful field selection for best display results.
- Bulk delete is intended for the records returned by the active query and should be used carefully.

## Security Considerations

- Avoid using unsanitized user input directly in dynamic SOQL without validation.
- Apply appropriate sharing and permission controls in your org.
- Review the Apex controller for business-specific constraints before broad use.

## Troubleshooting

- If queries fail, confirm the running user has access to the target object and fields.
- If no results appear, verify that the query is valid and that records exist.
- For runtime issues, review the browser console and Salesforce debug logs.
- If save or update actions fail, inspect the error message returned by the Apex layer.

## Contribution

If you extend the component, keep the experience consistent with Lightning Design System patterns and validate both UI and Apex behavior after changes.

## License

This project is provided as-is. Add your organization’s preferred license text if required.
