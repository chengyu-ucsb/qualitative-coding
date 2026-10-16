# Qualitative Coding

A shared workspace for qualitative coding projects.

**AI and Education** is the first project: independent title-and-abstract screening for a scoping review of communication research on generative AI in higher education.

## Structure

- `docs/`: GitHub Pages website, project interface and fictional practice workspace.
- `backend/Code.gs`: complete Google Apps Script backend, including the messaging bridge.
- `backend/bridge.html`: readable source of the bridge embedded in Code.gs.
- `tests/`: server safeguards and public-file checks.

GitHub Pages serves the interface. Google Sheets stores study records, codes and decisions. Nothing in the public repository contains the workbook, real coder codes or study decisions.

## Activate study coding

1. Open the supplied setup workbook as a native Google Sheet.
2. Open **Extensions → Apps Script** and replace Code.gs with `backend/Code.gs` from this repository.
3. Run `setup` once. It preserves an existing linked decisions file.
4. Deploy as a web app: execute as yourself, access **Anyone**. For an existing deployment, publish a new version.
5. Copy the `/exec` deployment URL into `endpoint` in `docs/ai-and-education/config.js` and commit.
6. Test a save and resume on a second browser before inviting coders. Then distribute the project URL and each coder's code privately.

Until an endpoint is configured, the study page clearly indicates that coding is not active. The practice workspace uses three synthetic records and browser-only storage.

## Publishing

In repository Settings → Pages, deploy from the `main` branch, `/docs` folder. This is a project site at `/qualitative-coding/`; no root user-site repository or custom domain is required. All internal navigation uses relative links.

## Study controls

Manage the codebook, deadline message and `test_open` in the original Google Sheet. Test records are released only when that setting is enabled and the requesting coder's development set has been saved completely. Saves enforce the same gate on the server.

The Progress tab contains completion counts; decisions remain in the separately linked data spreadsheet. This supports procedural blinding: the Drive owner still technically has access to the data file. Do not open it while your own coding is ongoing. Coder codes are bearer credentials; share them privately and use distinct codes per person.

The supplied screening criteria and unresolved protocol choices are unchanged. Resolve the protocol's pending decisions before locking the test phase.

## More projects

Give each project its own folder, branding, `config.js`, browser-storage namespace and Google Sheet/backend deployment. Add a project card to `docs/index.html`. The current interface contains AI-and-education screening questions; adapt those deliberately for a different study.

## Verification

Run `node --test tests/*.test.cjs`. Tests use fictional records and mocked Google services. They do not establish that a real Google deployment works. Verify live saving, recovery, cross-device resume and access restrictions after deployment.
