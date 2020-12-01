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

const getValidatorHeader = (updateIndex = 1) => {
  updateIndex = Number.isNaN(updateIndex) ? 1 : updateIndex;
  return `## Issue validator - update # ${updateIndex}\n\nHello!\n`;
};

const updateComment = async (client, issue, body) => {
  const comments = await client.issues.listComments({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  });
  // todo refactor to optional chaining, kept that way to make it work with older nodejs versions
  if (comments && comments.data && comments.data.length) {
    const lastComment = comments.data.slice(-1)[0];
    if (
      lastComment &&
      lastComment.user &&
      lastComment.user.login !== "github-actions[bot]"
    ) {
      return false;
    }
    const lastCommentIndex = Number.parseInt(
      lastComment.body.split("update # ")[1]
    );
    body = `${getValidatorHeader(lastCommentIndex + 1)}${body}`;
    await client.issues.updateComment({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      comment_id: lastComment.id,
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
  // in case last comment of this issue is created by bot
  // we don't want to re-post but update instead
  let lastCommentUpdated = await updateComment(client, issue, body);

  // no bot-created last comment detected, creating new comment
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

    const labels = core.getInput("required-sections").toLowerCase().split(";");
    const requiredSections = [];
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
      sections.forEach((section) => {
        requiredSections.push([section, labelName]);
      });
    });

    // there are no required sections, we should break here
    // unless it comes from the fact that the action is [unlabeled]
    // then we should inform the user that the issue is correct
    if (!requiredSections.length && payload.action !== "unlabeled") {
      console.log("nothing to do");
      return;
    }

    const issueBody = payload.issue.body.toLowerCase();
    const problems = [];

    requiredSections.forEach(([section, label]) => {
      const problem = checkSection(issueBody, section);
      problem && problems.push(problem + `(for label ${label})`);
    });

    if (problems.length) {
      const header =
        "It seems like there are some problems with your issue. Please fix them and wait for the validator to confirm that everything is alright.\nThank you!\n\nValidator encountered the following problems:\n\n";
      createOrUpdateComment(
        client,
        issue,
        header + problems.map((problem) => `- ${problem}\n`).join("")
      );
    } else {
      console.log("everything is ok");
      createOrUpdateComment(
        client,
        issue,
        "Congratulations! Your issue passed the validator! Thank you!"
      );
    }
  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
})();
