import Adapter from 'src/adapter';
import bidfactory from 'src/bidfactory';
import bidmanager from 'src/bidmanager';
import * as utils from 'src/utils';
import { ajax } from 'src/ajax';
import { STATUS } from 'src/constants';
import { queueSync, persist } from 'src/cookie';
import adaptermanager from 'src/adaptermanager';

const TYPE = 's2s';
const DEFAULT_ENDPOINT = '//e.serverbid.com/api/v2';
const BID_SUCCESS = 1;
const BID_EMPTY = 2;

/**
 * S2S bidder adapter for ServerBid
 */
function ServerBidServerAdapter() {
  let baseAdapter = Adapter.createNew('serverbidS2S');

  const sizeMap = [null,
    '120x90',
    '120x90',
    '468x60',
    '728x90',
    '300x250',
    '160x600',
    '120x600',
    '300x100',
    '180x150',
    '336x280',
    '240x400',
    '234x60',
    '88x31',
    '120x60',
    '120x240',
    '125x125',
    '220x250',
    '250x250',
    '250x90',
    '0x0',
    '200x90',
    '300x50',
    '320x50',
    '320x480',
    '185x185',
    '620x45',
    '300x125',
    '800x250'
  ];

  let config = {};
  baseAdapter.setConfig = function(s2sconfig) {
    config = s2sconfig;
  };

  const bidIds = [];

  baseAdapter.callBids = function(params) {
    if (params && params.bids && utils.isArray(params.bids) && params.bids.length) {
      const request = {
        placements: [],
        time: Date.now(),
        user: {},
        url: utils.getTopWindowUrl(),
        referrer: document.referrer,
        enableBotFiltering: true,
        includePricingData: true
      };

      const bids = params.bids || [];
      for (let i = 0; i < bids.length; i++) {
        const bid = bids[i];

        bidIds.push(bid.bidId);

        const bidRequest = {
          networkId: bid.params.networkId,
          siteId: bid.params.siteId,
          zoneIds: bid.params.zoneIds,
          campaignId: bid.params.campaignId,
          flightId: bid.params.flightId,
          adId: bid.params.adId,
          divName: bid.bidId,
          adTypes: bid.params.adTypes || getAdTypes(bid.sizes),
          bidders: bid.params.bidders
        };

        if (bidRequest.networkId && bidRequest.siteId) {
          request.placements.push(bidRequest);
        }
      }

      if (request.placements.length > 0) {
        const endpoint = config.endpoint || DEFAULT_ENDPOINT;
        const payload = JSON.stringify(request);
        ajax(endpoint, _responseCallback, request, {
          method: 'POST',
          withCredentials: true,
          contentType: 'application/json'
        });
      }
    }
  };

  function _responseCallback(json) {
    let result;

    try {
      result = JSON.parse(json);
    } catch (error) {
      utils.logError(error);
    }

    bidIds.forEach(function(bidId) {
      const bidRequest = utils.getBidRequest(bidId);
      const bids = getBids(bidId, bidRequest, result);
      bids.forEach(function(bid) {
        bid.bidderCode = bidRequest.bidder;
        bidmanager.addBidResponse(bidRequest.placementCode, bid);
      });
    });
  }

  function getBids(bidId, bidRequest, result) {
    const bidResponses = result && result.bids && result.bids[bidId];

    // If no bids were returned, register one empty bid for the placement.
    if (!bidResponses || bidResponses.length === 0) {
      return [bidfactory.createBid(BID_EMPTY, bidRequest)];
    }

    return bidResponses.map(function(bidResponse) {
      const decision = bidResponse.decision;
      const price = decision.pricing && decision.pricing.clearPrice;

      // If the bid doesn't have a price, treat it as empty.
      if (!price) {
        return bidfactory.createBid(BID_EMPTY, bidRequest);
      }

      const bid = bidfactory.createBid(BID_SUCCESS, bidRequest);

      bid.cpm = price;
      bid.width = decision.width;
      bid.height = decision.height;

      if (decision.contents && decision.contents.length > 0) {
        bid.ad = decision.contents[0].body + utils.createTrackPixelHtml(decision.impressionUrl);
      }
      else {
        bid.ad = null;
      }

      return bid;
    });
  }

  function getAdTypes(sizes) {
    const result = [];
    sizes.forEach(function(size) {
      const index = sizeMap.indexOf(size[0] + 'x' + size[1]);
      if (index >= 0) {
        result.push(index);
      }
    });
    return result;
  }

  return {
    callBids: baseAdapter.callBids,
    createNew: ServerBidServerAdapter.createNew,
    setConfig: baseAdapter.setConfig,
    setBidderCode: baseAdapter.setBidderCode,
    type: TYPE
  };
}

ServerBidServerAdapter.createNew = function() {
  return new ServerBidServerAdapter();
};

adaptermanager.registerBidAdapter(new ServerBidServerAdapter(), 'serverbidS2S');

module.exports = ServerBidServerAdapter;
