# AI Literacy Assessment

A hackathon project exploring how to assess students’ use of AI during ordinary university coursework and give them feedback they can act on.

## Project goal

Students work on a task in a chat-based workspace. The assessment looks for evidence of effective, critical, and responsible AI use in the conversation and the submitted work. A short follow-up can collect evidence when the interaction alone leaves a competency unclear. The student-facing prototype aims to return a score and concise feedback tied to specific decisions.

## Status and setup

This is the initial repository setup. The application, runtime dependencies, and technology stack will be documented here as they land. Git is the only prerequisite for cloning this revision.

```sh
git clone https://github.com/zyunkai127-oss/ai-literacy-assessment.git
cd ai-literacy-assessment
```

## Contributing

Use GitHub Issues for tasks and bugs. Keep `main` stable and open a pull request from a short-lived branch for each change.

```sh
git switch main
git pull --ff-only
git switch -c feature/short-description
# Make and check your changes, then stage the intended files.
git add path/to/changed-file
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Open a pull request into `main`, link the relevant issue, and include how you tested the change. Ask a teammate to review before merging. Contributors with write access can push branches directly. Others can submit pull requests from a fork.

Keep credentials, unpublished assessment answers, student submissions, and conversation logs out of this public repository. Use synthetic examples for development and demos.
