# Fun Tone

`commitment-issues` uses standard output by default.

Projects can opt in to a more playful advisory message style:

```json
{
  "precommitChecks": {
    "tone": "fun"
  }
}
```

This setting only changes advisory message text. It does not change exit codes, safety checks, automatic fixes, push behavior, or blocking behavior.

Use it when local developer output can have more personality while CI and default installs stay neutral.
