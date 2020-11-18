# Issue Validator

This github action checks whether an issue is valid in terms of containing specified sections for certain labels.

You can assign required sections for labels in workflow config.

This action is designed to be used with following event types:

```yml
types: [edited, labeled, unlabeled]
```

You can find the full list of event types [here](https://docs.github.com/en/free-pro-team@latest/actions/reference/events-that-trigger-workflows#issues)

## Inputs

### `required-sections`

**Required** a list of labels and sections assigned to them. Labels should be separated by `;`, sections by `,`. First element of every list is a label name, all of the following are required sections names.

It should look like this:

- `bug,Description,Steps to reproduce,Expected behaviour;feature request,motivation`
- `documentation,description,motivation;bug,description,expected behavior,actual behavior;question,description`.

This is case insensitive but watch out for the spaces(just be careful to not put a space after separators, that string will be just split by them without trimming any spaces as they may occur in section names).

## Example usage

Here is the example config file:

```yml
name: Validate issues
on:
  issues:
    types: [edited, labeled, unlabeled]

jobs:
  check_issue:
    runs-on: ubuntu-latest
    name: Validate issue
    steps:
      - name: Validate issue
        id: validate-issue
        uses: karol-bisztyga/issue-validator@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          required-sections: documentation,description;bug,description,expected behavior,actual behavior;question,description
```
