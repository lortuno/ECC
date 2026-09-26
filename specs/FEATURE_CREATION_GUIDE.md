# SDD: Installation Guide for Skills, Agents, and Hooks

**Document Version:** 1.0  
**Last Updated:** September 26, 2026  
**Status:** Implemented (see Implementation Notes / Deviations below)

---

## 1. Overview & Purpose

This specification defines the requirements for creating and maintaining a comprehensive installation guide that enables developers to add new Skills, Agents, and Hooks to a Claude-based AI project. The guide must provide step-by-step instructions, file update procedures, and verification methods.

### Scope
- Installation procedures for Skills
- Installation procedures for Agents
- Installation procedures for Hooks
- The installation procedures may be manual or from internet repository. E.G: npx claude-code-templates@latest --agent development-team/mobile-developer
- File update workflows
- Dependency management
- Verification and testing
- Troubleshooting section
---

## 2. Functional Requirements

### 2.1 Skill Installation Guide

**REQ-F-2.1.1:** Guide must document the directory structure for skills
- Skills location: `/mnt/skills/[public|private|user]/`
- File naming conventions
- Version management approach

**REQ-F-2.1.2:** Guide must include step-by-step installation steps
- Creating skill directory
- Writing SKILL.md metadata file
- Creating implementation files
- Registering skill in skill catalog

**REQ-F-2.1.3:** Guide must specify required metadata fields in SKILL.md
- name: Human-readable skill name
- description: Trigger conditions and use cases
- location: File system path
- dependencies: Required libraries or tools
- category: Skill classification

**REQ-F-2.1.4:** Guide must document how to register skills in available_skills list
- JSON format for skill registration
- Triggering conditions syntax
- Conditional skill loading

### 2.2 Agent Installation Guide

**REQ-F-2.2.1:** Guide must document agent types supported by Claude
- Agentic systems (state machines)
- Tool-using agents
- Multi-step agents
- Autonomous agents vs. supervised agents

**REQ-F-2.2.2:** Guide must include agent configuration structure
- Agent name and identifier
- System prompts
- Available tools/skills
- Decision logic
- Output format requirements

**REQ-F-2.2.3:** Guide must specify agent registration in project
- Location in project structure
- Configuration file format (JSON/YAML)
- Environment variable setup
- Agent lifecycle management

**REQ-F-2.2.4:** Guide must document agent-skill relationships
- How agents discover available skills
- Passing skills to agent context
- Skill permission scoping

### 2.3 Hook Installation Guide

**REQ-F-2.3.1:** Guide must define hook types supported
- Pre-processing hooks
- Post-processing hooks
- Event-driven hooks
- Conditional execution hooks

**REQ-F-2.3.2:** Guide must document hook file structure
- Hook entry point specification
- Parameter passing conventions
- Return value requirements
- Error handling in hooks

**REQ-F-2.3.3:** Guide must specify hook registration
- Hook registry/configuration file
- Event binding syntax
- Trigger conditions
- Execution order (priority)

**REQ-F-2.3.4:** Guide must include hook lifecycle documentation
- Initialization
- Execution
- Error states
- Cleanup/teardown

### 2.4 File Updates & Manifest Management

**REQ-F-2.4.1:** Guide must document all files requiring updates when adding skills/agents/hooks
- Configuration files (config.json, .env, settings.yaml, etc.)
- Registry/index files
- Documentation files
- Test configuration files
- CI/CD pipeline files

**REQ-F-2.4.2:** Guide must provide a checklist of required updates
- Which files need modification
- What each modification does
- Order of updates (dependencies)
- Rollback procedures

**REQ-F-2.4.3:** Guide must document version/dependency updates
- package.json updates (if applicable)
- requirements.txt for Python dependencies
- Lock file regeneration
- Import path updates

**REQ-F-2.4.4:** Guide must specify manifest file requirements
- MANIFEST.md or equivalent
- Listing of new components
- Change log entries
- Version bumping strategy

### 2.5 Claude Integration

**REQ-F-2.5.1:** Guide must explain how Claude discovers and uses skills
- Skill availability to Claude
- Skill triggering mechanisms
- Conditional skill loading based on context
- Skill versioning in Claude requests

**REQ-F-2.5.2:** Guide must document passing agents to Claude
- Agent context injection
- Agent state management
- Tool calling from agents
- Response handling

**REQ-F-2.5.3:** Guide must explain hook integration with Claude
- Hook execution during Claude API calls
- Pre/post processing of Claude responses
- Error propagation

---

## 3. Non-Functional Requirements

### 3.1 Usability

**REQ-NF-3.1.1:** Guide readability level
- Target audience: Developers with 2+ years experience
- Clear section headings
- Table of contents
- Visual diagrams for complex workflows

**REQ-NF-3.1.2:** Guide length and structure
- Main guide: 3,000-5,000 words
- Modular sections for each component type
- Quick-reference checklists
- Links between related sections

**REQ-NF-3.1.3:** Code examples
- Minimum 5 complete examples (1 per major section + 1 integrated)
- All examples must be copy-paste ready
- Examples must follow project conventions
- Example files provided separately if >50 lines

### 3.2 Maintainability

**REQ-NF-3.2.1:** Guide must be version-controlled
- Located in `/docs/INSTALLATION_GUIDE.md`
- Change log section documenting updates
- Git history preserved

**REQ-NF-3.2.2:** Guide must be updateable without code changes
- No hardcoded paths requiring recompilation
- Configuration examples use placeholders
- Update procedures documented for guide maintainers

### 3.3 Completeness

**REQ-NF-3.3.1:** Guide coverage
- Covers all three component types (skills, agents, hooks)
- Includes happy path and common error scenarios
- Documents at least 3 common mistakes per component

**REQ-NF-3.3.2:** External reference documentation
- Links to Claude documentation
- References to MCP documentation if applicable
- Links to project-specific docs (if existing)

---

## 4. Use Cases & User Stories

### UC-1: Developer Installs First Skill

**User Story:**  
As a developer new to the project, I want to install a simple skill so that I can understand the workflow before creating complex components.

**Scenario:**
1. Developer reads quick-start section
2. Developer creates skill directory structure
3. Developer copies example SKILL.md
4. Developer registers skill in available_skills
5. Developer verifies skill loads
6. Developer creates first skill

**Acceptance Criteria:**
- Guide provides working example
- All steps are sequential
- Verification step confirms success
- Estimated time: 15 minutes

---

### UC-2: Team Lead Installs Agent with Multiple Hooks

**User Story:**  
As a team lead, I want to install a complex agent with pre and post-processing hooks so that I can integrate Claude with our existing system.

**Scenario:**
1. Lead reviews agent architecture section
2. Lead creates agent configuration
3. Lead creates multiple hook files
4. Lead registers hooks in correct order
5. Lead updates all related configuration files
6. Lead tests agent + hook integration
7. Lead verifies Claude integration

**Acceptance Criteria:**
- Multi-step installation documented
- Hook execution order clarified
- Test procedure provided
- Estimated time: 45 minutes

---

### UC-3: Developer Updates Existing Component

**User Story:**  
As a developer, I want to update an existing skill's metadata so that changes propagate correctly to all related files.

**Scenario:**
1. Developer modifies SKILL.md
2. Developer updates available_skills registration
3. Developer updates documentation references
4. Developer runs verification
5. Developer commits with proper change log

**Acceptance Criteria:**
- All impacted files identified
- Update order specified
- No orphaned references remain
- Estimated time: 10 minutes

---

## 5. Acceptance Criteria

### AC-1: Guide Structure
- [ ] Table of contents with working links
- [ ] Clear section for each component type
- [ ] Quick reference checklist at start
- [ ] Troubleshooting section at end

### AC-2: Content Completeness
- [ ] Skills section: ≥1,000 words with 2 examples
- [ ] Agents section: ≥1,200 words with 2 examples
- [ ] Hooks section: ≥1,000 words with 2 examples
- [ ] File Updates section: ≥800 words with checklist
- [ ] Claude Integration section: ≥600 words

### AC-3: Code Examples
- [ ] All examples are valid/executable
- [ ] Examples follow project naming conventions
- [ ] Examples include error handling
- [ ] Each example has explanatory comments
- [ ] Separate example files provided (if needed)

### AC-4: Verification & Testing
- [ ] Guide includes verification steps for each component
- [ ] Includes commands to test installation
- [ ] Includes diagnostic commands for troubleshooting
- [ ] Success/failure criteria clearly defined

### AC-5: Documentation Quality
- [ ] No broken links
- [ ] Consistent terminology
- [ ] Consistent formatting
- [ ] Professional tone
- [ ] No typos/grammar errors

---

## 6. Common Errors & Edge Cases

### Edge Case 1: Skill Name Conflicts
**Problem:** Attempting to install skill with name already in registry  
**Solution:** Guide must document name uniqueness requirement and conflict resolution  
**Documentation:** Validation procedures section

### Edge Case 2: Hook Execution Order Dependencies
**Problem:** Hook B depends on Hook A, but Hook A is registered after Hook B  
**Solution:** Guide must specify execution order specification and provide validation tool  
**Documentation:** Hook priority/ordering section

### Edge Case 3: Missing Dependencies
**Problem:** Skill requires external library not installed  
**Solution:** Guide must include dependency checking procedure  
**Documentation:** Dependency management section

### Edge Case 4: Claude Version Incompatibility
**Problem:** New skill uses Claude API feature from newer version  
**Solution:** Guide must include version compatibility matrix  
**Documentation:** Requirements/prerequisites section

### Edge Case 5: Partial Installation Failure
**Problem:** File updates completed but skill registration failed  
**Solution:** Guide must include rollback procedure  
**Documentation:** Troubleshooting/recovery section

---

## 7. Success Metrics

**SU-1: Time to First Installation**
- A new developer should complete first skill installation in ≤20 minutes
- Measurement: Time from opening guide to verification success

**SU-2: Zero Common Mistakes**
- Target: <5% of developers encounter documented error scenarios
- Measurement: Error tracking in project CI/logs

**SU-3: Guide Completeness**
- All required sections present and documented
- Measurement: Checklist in AC-4

**SU-4: Example Usability**
- All provided examples execute without modification
- Measurement: Example testing in CI pipeline

**SU-5: Support Reduction**
- Reduce installation-related questions by ≥70%
- Measurement: Support ticket tracking

---

## 8. Testing Strategy

### Test Plan: Installation Guide Verification

**TP-1: Skill Installation (Happy Path)**
- [ ] Create new skill from guide instructions
- [ ] Verify skill appears in available_skills
- [ ] Verify Claude can access skill
- [ ] Verify skill executes correctly

**TP-2: Agent Installation (Happy Path)**
- [ ] Create agent from guide configuration
- [ ] Register agent in system
- [ ] Verify agent initialization
- [ ] Test agent-skill interaction

**TP-3: Hook Installation (Happy Path)**
- [ ] Create pre-processing hook
- [ ] Create post-processing hook
- [ ] Register both hooks
- [ ] Verify execution order
- [ ] Verify data passing between hooks

**TP-4: File Updates Validation**
- [ ] Verify all required files updated
- [ ] Verify no syntax errors in configs
- [ ] Verify all references valid
- [ ] Verify version consistency

**TP-5: Error Scenarios**
- [ ] Test with missing dependency
- [ ] Test with skill name conflict
- [ ] Test with invalid hook configuration
- [ ] Test with incomplete file updates
- [ ] Verify error messages are helpful

---

## 9. Deliverables

### D-1: Installation Guide Document
- **Format:** Markdown (.md)
- **Location:** `/docs/INSTALLATION_GUIDE.md`
- **Word Count:** 5,000-7,000 words
- **Includes:** All sections from REQ-F-2.x

### D-2: Example Code Files
- **Location:** `/docs/examples/`
- **Files:**
    - `example_skill.md` (skill metadata)
    - `example_skill.py` (skill implementation)
    - `example_agent.json` (agent configuration)
    - `example_hook_pre.py` (pre-processing hook)
    - `example_hook_post.py` (post-processing hook)

### D-3: Installation Checklist
- **Format:** Markdown with checkboxes
- **Location:** In guide as section or `/docs/INSTALLATION_CHECKLIST.md`
- **Content:** Checklist for each component type

### D-4: Troubleshooting Reference
- **Format:** FAQ-style markdown
- **Location:** `/docs/TROUBLESHOOTING.md`
- **Content:** Common errors and solutions

---

## 10. Out of Scope

- Actual implementation of skills/agents/hooks (separate task)
- Graphical UI for component creation
- Automated installation scripts (may be separate task)
- Deep API documentation (should link to existing docs)
- Training or video content

---

## 11. Assumptions

1. Claude integration library/SDK is already available
2. Project structure follows documented conventions
3. Developers have basic Python/JavaScript knowledge
4. Git is used for version control
5. Project has existing documentation standards

---

## 12. Approval Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | [Name] | | |
| Lead Developer | [Name] | | |
| Technical Writer | [Name] | | |

---

## 13. Implementation Notes / Deviations

Implemented as: `HOW_TO_CREATE_A_HOOK.md` (new) + `docs/examples/hook-authoring/` (new worked example), `docs/INSTALLATION_GUIDE.md` (new, consolidated entry point), `docs/INSTALLATION_CHECKLIST.md` (new), an "Installation Errors" section appended to `docs/TROUBLESHOOTING.md`, and a cross-link added to `README.md`. Two guides already covering most of REQ-F-2.1/2.2 existed before this work (`HOW_TO_CREATE_AN_AGENT.md`, `HOW_TO_CREATE_A_SKILL.md`), so this implementation extended that existing pattern to hooks and added the consolidating layer, rather than rewriting from scratch.

This spec was written generically rather than for this repo's actual conventions; the following deviations were made deliberately, continuing the precedent the two pre-existing guides already set:

- **Word count**: `docs/INSTALLATION_GUIDE.md` is link-heavy by design (links to the three `HOW_TO_CREATE_A_*.md` guides rather than duplicating their content) and runs under both of this spec's own conflicting word-count targets (REQ-NF-3.1.2's 3,000–5,000 vs. D-1's 5,000–7,000). Duplicating content across documents would violate this repo's established "the guide owns the checklist, don't duplicate across docs" convention.
- **AC-2 per-section example counts**: the Skills/Agents sections of `INSTALLATION_GUIDE.md` each link to one existing worked example rather than adding a second, to avoid duplicating content already in `HOW_TO_CREATE_A_SKILL.md`/`HOW_TO_CREATE_AN_AGENT.md`. The Hooks section natively ships two (pre + post).
- **REQ-NF-3.1.3's "1 integrated" example**: satisfied as a prose walkthrough (UC-2 in `INSTALLATION_GUIDE.md`, tying the skill/agent/hook worked examples into one narrative), not a fifth standalone runnable code file.
- **REQ-F-2.2.1's agent taxonomy** ("agentic systems/state machines," "autonomous vs. supervised agents"): not covered. This repo's agents are bounded leaf subagents with no `Task`/`Agent` tool access (see `HOW_TO_CREATE_AN_AGENT.md` §2) — that generic taxonomy doesn't describe how agents work here.
- **REQ-F-2.1.1's `/mnt/skills/[public|private|user]/` path, REQ-F-2.4.3's Python/requirements.txt framing, and REQ-F-2.4.4's root `MANIFEST.md`**: none exist in this repo. Real equivalents (`skills/` + `.claude/skills/` per `docs/SKILL-PLACEMENT-POLICY.md`; `manifests/install-modules.json`; `docs/releases/<version>/release-notes.md`) are named explicitly in `docs/INSTALLATION_GUIDE.md` instead of fabricating the spec's assumed files.
- **Success Metrics (§7, SU-1..SU-5)**: process/measurement targets (time-to-first-install, support-ticket reduction) that no document can itself satisfy or prove — not doc-verifiable, and out of scope for this deliverable by nature rather than by scoping choice.

**End of Specification Document**
