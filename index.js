const { lint } = require(`stylelint`);
const config = require(`@moedelo/stylelint-config`);

//todo указать после размещения в прод
const botUserId = 49732390;

module.exports = app => {
    app.log(`Yay, the app was loaded!`);

    app.on(
        [
            `pull_request.opened`,
            `pull_request.reopened`,
            `pull_request.synchronize`
        ],
        async context => {
            await deleteOldComments(context);
            const comments = [];

            const { data } = await context.github.pullRequests.getFiles({
                repo: context.repo().repo,
                owner: context.repo().owner,
                number: context.payload.number
            });

            for (let i = 0; i < data.length; i += 1) {
                const file = data[i];

                if(isStyleFile(file.filename)){
                    const diffMap = getLineMapFromPatchString(file.patch);

                    const responce = await context.github.gitdata.getBlob({
                        file_sha: file.sha,
                        repo: context.repo().repo,
                        owner: context.repo().owner
                    });

                    const code = new Buffer(responce.data.content, `base64`).toString();
                    const errors = await lint({ config, code });

                    if(!errors.errored){
                        continue;
                    }

                    errors.results[0].warnings.forEach(warning => {
                        const position = diffMap[warning.line];

                        if (position) {
                            const remark = `${warning.text}  +rule: ${warning.rule}`;
                            const existingCommentIndex = comments.findIndex(comment =>
                                comment.position === position && comment.path === file.filename);

                            if (existingCommentIndex >= 0) {
                                comments[existingCommentIndex].body = `${comments[existingCommentIndex].body}\n ${remark}`;
                            } else {
                                comments.push({ body: remark, path: file.filename, position });
                            }
                        }
                    });
                }

                if (!comments.length) {
                    return context.github.pullRequests.createReview({
                        repo: context.repo().repo,
                        owner: context.repo().owner,
                        number: context.payload.number,
                        event: `APPROVE`
                    });
                }

                context.github.pullRequests.createReview({
                    body: `Каждый раз, когда ты не соблюдаешь code style в мире плачет один енотик`,
                    repo: context.repo().repo,
                    owner: context.repo().owner,
                    number: context.payload.number,
                    event: `REQUEST_CHANGES`,
                    comments
                });
            }
        }
    );
};

function isStyleFile(filename) {
    const rowArr = filename.split('.');
    return rowArr[rowArr.length-1] === 'less' || rowArr[rowArr.length-1] === 'css';
}

function getLineMapFromPatchString(patchString) {
    let diffLineIndex = 0;
    let fileLineIndex = 0;
    return patchString.split(`\n`).reduce((lineMap, line) => {
        if (line.match(/^@@.*/)) {
            fileLineIndex = line.match(/\+[0-9]+/)[0].slice(1) - 1;
        } else {
            diffLineIndex += 1;
            if (`-` !== line[0]) {
                fileLineIndex += 1;
                // eslint-disable-next-line no-param-reassign
                lineMap[fileLineIndex] = diffLineIndex;
            }
        }
        return lineMap;
    }, {});
}

async function deleteOldComments(context) {
    try {
        const { data } = await context.github.pullRequests.listComments({
            number: context.payload.number,
            owner: context.repo().owner,
            repo: context.repo().repo
        });
        for (let i = 0; i < data.length; i += 1) {
            const comment = data[i];

            if (comment.user.id === botUserId) {
                // eslint-disable-next-line no-await-in-loop
                await context.github.pullRequests.deleteComment({
                    owner: context.repo().owner,
                    repo: context.repo().repo,
                    comment_id: comment.id
                });
            }
        }
    } catch (e) {
        console.log(e);
    }
}


