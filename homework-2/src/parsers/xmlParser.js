const xml2js = require('xml2js');

const { ParseError } = require('../errors');

function normalizeTicket(raw) {
  const ticket = { ...raw };

  if (raw.tags && typeof raw.tags === 'object') {
    const tagNode = raw.tags.tag;
    if (tagNode === undefined) {
      ticket.tags = [];
    } else if (Array.isArray(tagNode)) {
      ticket.tags = tagNode.map(String);
    } else {
      ticket.tags = [String(tagNode)];
    }
  }

  if (raw.metadata && typeof raw.metadata === 'object') {
    ticket.metadata = { ...raw.metadata };
  }

  return ticket;
}

async function parseXml(buffer) {
  let root;
  try {
    root = await xml2js.parseStringPromise(buffer.toString('utf8'), {
      explicitArray: false,
      trim: true,
    });
  } catch (err) {
    throw new ParseError(`Malformed XML: ${err.message}`);
  }

  if (!root || !root.tickets) {
    throw new ParseError('Malformed XML: expected <tickets> root element');
  }

  const ticketNode = root.tickets.ticket;
  if (ticketNode === undefined) return [];
  const tickets = Array.isArray(ticketNode) ? ticketNode : [ticketNode];
  return tickets.map(normalizeTicket);
}

module.exports = { parseXml };
