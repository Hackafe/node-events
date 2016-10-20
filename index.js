var debug = require('debug')('hackafe-events');
var config = require('./config');
var request = require('request');

var FACEBOOK_EVENT_PATTERN = /((https?:)?\/\/(www.)?facebook\.com\/events\/\d+)/i;
var FORUM_THREAD_PATTERN = /((https?:)?\/\/frm\.hackafe\.org\/t\/[-a-zA-Z0-9]+\/\d+)/i;

var labelCache = {};

module.exports = function list(opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }

    var deferred = getBoardVisibleCards(config.boardId)
        .then(function (cards) {
            return Promise.all(cards.map(transform));
        })
        .then(function (events) {
            return events.filter(upcomming);
        });

    if (typeof cb === 'function') {
        deferred.then(function (events) {
            cb(null, events);
        }, function (err) {
            cb(err);
        });
    }
    return deferred;
};

function tfetch(opts) {
    if (typeof opts === 'string') opts = {url: opts};
    opts.url += '?key=' + config.apiKey;
    opts.json = true;
    return new Promise(function (resolve, reject) {
        debug('fetching %s', opts.url);
        request(opts, function (err, res, data) {
            if (err) return reject(err);
            debug('fetched %s', opts.url);
            resolve(data);
        });
    });
}

function getBoardVisibleCards(boardId) {
    return tfetch('https://api.trello.com/1/boards/' + config.boardId + '/cards/visible');
}

function getCardAttachment(cardId, attachmentId) {
    return tfetch('https://api.trello.com/1/cards/' + cardId + '/attachments/' + attachmentId);
}

function getLabel(labelId) {
    return labelCache[labelId] = labelCache[labelId] || tfetch('https://api.trello.com/1/labels/' + labelId);
}

function transform(card) {
    return Promise.resolve({
            id: card.id,
            desc: card.desc,
            name: card.name,
            start: card.due && new Date(card.due),
            url: card.url
        })
        .then(function fetchCover(event) {
            if (!card.idAttachmentCover) return event;
            return getCardAttachment(card.id, card.idAttachmentCover)
                .then(function (attachment) {
                    event.cover = attachment.url;
                    return event;
                })
        })
        .then(function extractFacebookEvent(event) {
            var match = event.desc &&
                event.desc.match(FACEBOOK_EVENT_PATTERN);
            if (match)
                event.facebookEvent = match[0];
            return event;
        })
        .then(function extractForumThread(event) {
            var match = event.desc &&
                event.desc.match(FORUM_THREAD_PATTERN);
            if (match)
                event.forumThread = match[0];
            return event;
        })
        .then(function resolveLabels(event) {
            if (!card.idLabels) return event;
            return Promise.all(card.idLabels.map(getLabel))
                .then(function (labels) {
                    event.labels = labels;
                    return event;
                });
        })
}

function upcomming(event) {
    return event.start && event.start.getTime() >= new Date().getTime();
}
