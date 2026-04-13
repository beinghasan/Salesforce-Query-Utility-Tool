# Salesforce-Query-Utility-Tool
Tool for querying in Salesforce Org

# SOQL Explorer (LWC)

A Lightning Web Component that lets admins and developers compose, run, and inspect SOQL queries directly in the Salesforce UI. It provides a lightweight query editor with result rendering and basic UX helpers.

## Features

- SOQL input editor with debounced validation (client-side syntax hints where applicable)
- Execute query against server via Apex controller (`SoqlExplorerController`)
- Result table rendering with dynamic columns
- Basic error surfacing from Apex/Query parser
- Minimalist styling aligned with SLDS
- Tab registration available via `SOQL_Explorer.tab-meta.xml` (navigate from the custom tab)

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
