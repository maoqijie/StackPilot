## Summary

Describe the problem and the outcome of this change.

## Scope

- Related issue:
- Out of scope:

## Verification

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=high`
- [ ] I reviewed the diff for secrets, local files, generated output, and unrelated changes.
- [ ] Workspace boundaries are preserved; Web does not import Controller internals and public packages do not depend on applications.

## Risk and Security

Describe effects on authentication, authorization, host commands, configuration, data, compatibility, or deployment. Write `None` only after checking these areas.

## Visual Evidence

For visual changes, include desktop and relevant responsive screenshots. Otherwise write `Not applicable`.

## Documentation

- [ ] Documentation and examples match the implemented commands and behavior.
- [ ] No documentation change is required.
