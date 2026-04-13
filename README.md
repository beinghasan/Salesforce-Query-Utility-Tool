# Salesforce-Query-Utility-Tool
Smart Tool for query data in Salesforce Org

# SOQL Explorer (LWC)

A Lightning Web Component that lets admins and developers compose, run, and inspect SOQL queries directly in the Salesforce UI. It provides a lightweight query editor with result rendering and basic UX helpers.

<img width="2888" height="1086" alt="image" src="https://github.com/user-attachments/assets/cf00ea17-4f55-473c-b7fc-2531c1372171" />

## Features

- SOQL Input Editor: High-performance code editor featuring debounced syntax validation and real-time query hints.
- Server-Side Execution: Seamless integration with a custom Apex controller to execute dynamic SOQL directly against the database.
- Dynamic Data Table: Adaptive UI that automatically maps server-side results to interactive, dynamic table columns.
- Error Handling: Robust error surfacing providing descriptive feedback from both the client-side parser and server-side Apex exceptions.
- SLDS Design: User interface strictly aligned with the Salesforce Lightning Design System for a native and intuitive experience.
- Data Portability: Integrated "Export to Excel" and "Copy to Clipboard" tools for effortless external data management.
- Record Management: Native support for single-row and bulk record deletion with built-in safety confirmation protocols.
- Data Navigation: Advanced result-set management featuring configurable pagination and real-time global search filters.
- Query Persistence: Smart history and favorite repository that stores up to 20 queries using a FIFO management logic.
- Flexible Deployment: Enterprise-ready configuration enabling accessibility via Custom Tabs, Utility Bars, or App Pages.

## Screenshots

Search Object
<img width="2022" height="696" alt="image" src="https://github.com/user-attachments/assets/05cf9ffc-9b95-40df-9409-3f6859008355" />

Select fields
<img width="2020" height="856" alt="image" src="https://github.com/user-attachments/assets/4ffe9b44-4ee6-4ddc-85cd-ba5a7e60049b" />

Manually add WHERE clause and extra fields (Like relationship if required) in SOQL Query textbox
<img width="2018" height="1252" alt="image" src="https://github.com/user-attachments/assets/c99919c1-9c54-4acb-8c54-cae88ecb5809" />

After click on Run Query, result will appear as below
<img width="2016" height="1106" alt="image" src="https://github.com/user-attachments/assets/00d2db42-f3de-4766-b1b9-a110dd45aabb" />

## Repository Locations

- Component bundle:
  - `force-app/main/default/lwc/soqlExplorer/soqlExplorer.html`
  - `force-app/main/default/lwc/soqlExplorer/soqlExplorer.js`
  - `force-app/main/default/lwc/soqlExplorer/soqlExplorer.css`
  - `force-app/main/default/lwc/soqlExplorer/soqlExplorer.js-meta.xml`
- Apex controller:
  - `force-app/main/default/classes/SoqlExplorerController.cls`
  - `force-app/main/default/classes/SoqlExplorerController.cls-meta.xml`
- Custom Tab (optional entry point):
  - `force-app/main/default/tabs/SOQL_Explorer.tab-meta.xml`

## Prerequisites

- Salesforce DX project configured (`sfdx-project.json` present)
- A target org authorized via Salesforce CLI
- User permissions to run queries on the targeted objects/fields
- Apex class `SoqlExplorerController` deployed and accessible to the running user

## Installation / Deployment

You can deploy the component and its controller with Salesforce CLI:

- Deploy everything in the project (safest when unsure):
  - `sf project deploy start`
- Or deploy only LWC + Apex for SOQL Explorer:
  - `sf project deploy start --metadata "LightningComponentBundle:soqlExplorer,ApexClass:SoqlExplorerController,CustomTab:SOQL_Explorer"`

If you use permission sets, ensure the executing user has access to:
- The `SoqlExplorerController` Apex class
- The objects/fields referenced by your queries
- The custom tab (if you plan to open it from the app launcher)

## Adding the Component to a Page

- App Builder: add "soqlExplorer" to a Lightning App Page or a Utility Bar.
- Custom Tab: Use the provided `SOQL_Explorer` tab to access the component directly.

## Usage

1. Open the SOQL Explorer (via the custom tab or a page where the component is placed).
2. Enter a SOQL query, e.g.:
   ```
   SELECT Id, Name, Industry FROM Account ORDER BY Name LIMIT 50
   ```
3. Click "Run" (or the component’s action control) to execute.
4. Inspect results in the datatable. Columns are derived from the selected fields.
5. Adjust the query and re-run as needed.

### Notes and Limitations

- Governor limits apply: large result sets may be truncated or hit limits depending on query complexity.
- Ensure all selected fields are visible to the running user profile/perm set, or queries may fail.
- Relationship queries (parent/child) may not render nested results fully; flattening or explicit field selection is recommended.
- For queries requiring WITH SECURITY_ENFORCED or FLS enforcement, apply appropriate patterns in the Apex controller.

## Apex Controller (Overview)

`SoqlExplorerController` is responsible for:
- Validating and executing the incoming SOQL
- Returning results in a JSON-serializable shape suitable for a datatable
- Handling limit/offset or pagination where implemented

Review the class in `force-app/main/default/classes/SoqlExplorerController.cls` for security enforcement and query safety patterns.

## Local Development and Testing

- LWC Jest tests can be added under `force-app/main/default/lwc/soqlExplorer/__tests__/`.
- Run tests:
  - `npm install` (first time)
  - `npm run test:unit`
- SOQL snippets for reference are available in `scripts/soql/` (e.g., `scripts/soql/account.soql`).

## Security Considerations

- Never blindly concatenate user input into dynamic SOQL in Apex without appropriate validation.
- Consider enforcing `WITH SECURITY_ENFORCED` or explicit FLS checks, depending on your org policy.
- Limit accessible objects/fields where necessary to prevent data exposure.
- Apply appropriate sharing settings (e.g., `with sharing`) on the controller as required by your org standards.

## Metadata Visibility

The component’s visibility and targets are controlled in:
- `soqlExplorer.js-meta.xml` (targets for App Builder, record pages, utility bar, etc.)
- `SOQL_Explorer.tab-meta.xml` (availability as a tab and app inclusion)

## Troubleshooting

- Error "insufficient access rights": verify Apex class access and object/field permissions.
- Empty results but no error: confirm data exists and user has read access.
- LWC runtime error: open Dev Console or browser console for stack traces.
- Apex exception: check Debug Logs to view the exact failure during query execution.

## Contributing

- Follow the existing ESLint/Prettier settings (`force-app/main/default/lwc/.eslintrc.json`, root `.prettierrc`).
- Keep UI consistent with SLDS.
- Prefer Lightning Data Table for rendering tabular results and avoid custom HTML tables unless needed.
- When enhancing features (e.g., pagination, saved queries, favorites), ensure limits and security are handled in Apex.

## License

This project is provided as-is without warranty. Include your organization’s license details here if applicable.
