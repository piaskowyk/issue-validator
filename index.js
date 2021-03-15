const core = require("@actions/core");
const github = require("@actions/github");

/**
 * functions
 */

const getSectionPosition = (issueBody, section) => {
  const regexp = new RegExp(`[#]+[ ]+${section}`);
  return issueBody.search(regexp);
};

const checkIfSectionNotEmpty = (issueBody, section, sectionPosition) => {
  const sub = issueBody.substr(sectionPosition);
  const sectionStartIndex =
    sub.search(new RegExp(`${section}`)) + section.length;
  const nextSectionPos = sub.search(new RegExp("\n[#]+"));
  const end = nextSectionPos === -1 ? undefined : nextSectionPos;
  const sectionContent = sub.substring(sectionStartIndex, end);
  return sectionContent.replace(/\r?\n|\r/g, "").replace(/ /g, "").length;
};

const checkSection = (issueBody, section) => {
  const sectionPosition = getSectionPosition(issueBody, section);
  if (sectionPosition !== -1) {
    if (!checkIfSectionNotEmpty(issueBody, section, sectionPosition)) {
      return `Section ${section} seems to be empty`;
    }
  } else {
    return `Section required but not found: ${section}`;
  }
};

const getValidatorHeader = () => '## Issue validator';

const updateComment = async (client, issue, body) => {
  const comments = await client.issues.listComments({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  });
  // todo refactor to optional chaining, kept that way to make it work with older nodejs versions
  if (comments && comments.data && comments.data.length) {
    let botComment;
    for (let i = 0; i < comments.data.length; ++i) {
      const comment = comments.data[i];
      if (
        comment &&
        comment.user &&
        comment.user.login === "github-actions[bot]"
      ) {
        botComment = comment;
        break;
      }
    }
    if (!botComment) {
      return false;
    }
    
    body = `${getValidatorHeader()}${body}`;
    await client.issues.updateComment({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      comment_id: botComment.id,
      body,
    });
    console.log("updated comment");
    return true;
  }
  return false;
};

const createNewComment = async (client, issue, body) => {
  console.log("creating new comment");
  body = getValidatorHeader() + body;
  await client.issues.createComment({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
    body,
  });
};

const createOrUpdateComment = async (client, issue, body) => {
  // in case some comment of this issue is created by bot
  // we don't want to re-post but update instead
  let lastCommentUpdated = await updateComment(client, issue, body);

  // no bot-created comment detected, creating new comment
  if (!lastCommentUpdated) {
    await createNewComment(client, issue, body);
  }
};

/**
 * main
 * should be used with types: [edited, labeled, unlabeled]
 */
(async () => {
  try {
    const { issue, payload } = github.context;

    const issueLabels = payload.issue.labels.map((label) => {
      return label.name.toLowerCase();
    });

    const client = github.getOctokit(
      core.getInput("github-token", { required: true })
    );

    const labeledWith =
      payload.action === "labeled"
        ? payload.label.name.toLowerCase()
        : undefined;

    console.log("labels in issue detected", issueLabels);
    console.log("action", payload.action);
    if (labeledWith) {
      console.log("labeled with", labeledWith);
    }

    const labels = core.getInput("required-sections").toLowerCase().split(";");
    let requiredSections = [];
    labels.forEach((labelData) => {
      const arr = labelData.split(",");
      const labelName = arr[0];
      // check label name - if it's undefined, the action is [edited] and we should check all the labels
      // otherwise focus only on label which has been added - which means skip all the rest
      if (labeledWith) {
        // [labeled]
        if (labeledWith !== labelName) {
          return;
        }
      } else {
        // [edited]
        // don't check if this label is not assigned to the issue
        if (issueLabels.indexOf(labelName) === -1) {
          return;
        }
      }
      const sections = arr.slice(1);
      requiredSections = requiredSections.concat(
        sections.map((section) => [section, labelName])
      );
      console.log(
        "adding sections to required ones",
        sections,
        "for label",
        labelName,
        "current result",
        requiredSections
      );
    });

    console.log("required sections", requiredSections);

    // there are no required sections, we should break here
    // unless it comes from the fact that the action is [unlabeled]
    // then we should inform the user that the issue is correct
    if (!requiredSections.length && payload.action !== "unlabeled") {
      console.log("nothing to do");
      return;
    }

    const issueBody = payload.issue.body.toLowerCase();
    const problems = [];

    console.log("checking sections");
    requiredSections.forEach(([section, label]) => {
      const problem = checkSection(issueBody, section);
      console.log("for", section, label, "the problem is", problem);
      problem && problems.push(problem + `(for label ${label})`);
    });

    console.log("all problems", problems);

    if (problems.length) {
      const header =
        "\n\nThe issue is invalid!\n\n";
      createOrUpdateComment(
        client,
        issue,
        header + problems.map((problem) => `- ${problem}\n`).join("")
      );
    }
  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
})();
