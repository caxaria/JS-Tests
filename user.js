/*jslint browser: true, nomen: true */
/*global escape: false, $: false, define: false, Backbone: false, _: false */

define(
    [
        'helpers/images',
        'helpers/platform',
        'helpers/translations'
    ],
    function (images, platform, translations) {
        'use strict';
        var round, formatDistance;
        var phaseToTypeLookup = {emails: 'email', websites: 'website', faxes: 'fax', phones: 'phone', mobiles: 'mobile', actions: 'action'};

        round = function (number, decimals) {
            var factor = Math.pow(10, decimals);

            return Math.round(number * factor) / factor;
        };

        formatDistance = function (distanceMeters) {
            if (distanceMeters >= 1000) {
                return round(distanceMeters / 1000.0, 1) + ' km';
            }

            return distanceMeters + ' m';
        };

        return Backbone.Model.extend({
            isAd: function () {
                return this.get('rowType').indexOf('ad_') === 0;
            },
            getTarget: function () {
                if (!this.isAd()) {
                    return null;
                }

                var has_offer = ['ad_mba_on_mof', 'ad_mpm'].indexOf(this.get('rowType')) > -1 && this.hasOffers();
                var id = this.get('id'),
                    offer_id = has_offer ? this.getCoverOffer().id : null,
                    embed_offer = has_offer && this.get('rowType') === 'ad_mpm';

                return {
                    id: id,
                    offer_id: offer_id,
                    embed_offer: embed_offer,
                };
            },
            getPhones: function () {
                var phones = _.where(this.get('contacts'), {element_name: 'phone'});

                return _.map(phones, function(phone) {
                    return {
                        anchor_href: 'tel:' + phone.contact_value,
                        label: phone.label || $.t('show_extra_label_phone'),
                        display: phone.display,
                        noAds: phone.refuse_advertising === 'true',
                        cost: phone.cost || null
                    };
                });
            },
            getExtra: function (optionalType) {
                var extra, extraItems, extraItemsOrder, extraItemsOrdered;
                var that = this;

                extra = _.where(this.get('contacts'), {element_name: 'extra', type: optionalType});

                // TODO this logic should belong to EXTAPI
                extraItems = [];
                _.each(extra, function (item) {

                    var key, label, anchorHref, text, cost;

                    key = item.type;
                    label = item.label || $.t('show_extra_label_' + item.type);
                    cost = item.cost || '';

                    switch (item.type) {
                    case 'phone':
                        anchorHref = 'tel:' + item.contact_value;
                        text = item.display;
                        break;
                    case 'mobile':
                        anchorHref = 'tel:' + item.contact_value;
                        text = item.display;
                        break;
                    case 'fax':
                        anchorHref = null;
                        text = item.display;
                        break;
                    case 'email':
                        anchorHref = 'mailto:' + item.contact_value;
                        text = item.contact_value;
                        break;
                    case 'website':
                        anchorHref = item.contact_value;
                        text = item.display;
                        break;

                    // If you add a new type, DO NOT FORGET to populate the extraItemsOrder array below !

                    default:
                        // Logos are handled in another place
                        return;
                    }

                    extraItems.push({
                        key: key,
                        label: label,
                        anchor_href: anchorHref,
                        text: text,
                        noAds: item.refuse_advertising === 'true',
                        cost: cost,
                    });
                });

                if (optionalType === 'action') {
                    _.each(this.get('actions'), function (item) {
                        var anchorHref;

                        if (item.adType) {
                            anchorHref = '#d/' + that.get('id') + '/' + item.adType;
                        } else {
                            anchorHref = item.url;
                        }

                        extraItems.push({
                            key: 'context_' + (item.adType || 'generic_action'),
                            anchor_href: anchorHref,
                            text: item.label,
                            noAds: item.refuse_advertising === 'true',
                            action_url: item.url,
                        });
                    });
                    if (this.getEntryType() !== 'poi') {
                        extraItems.push({
                            key: 'context_vcard',
                            anchor_href: 'http://tel.local.ch/en/vcard/' + this.get('id'),
                            text: $.t('show_extra_vcard'),
                            noAds: false
                        });
                    }
                }

                extraItemsOrder = this.getDetailOrder();
                extraItemsOrdered = _.sortBy(extraItems, function (extraItem) {
                    return _.indexOf(extraItemsOrder, extraItem.key);
                });

                return extraItemsOrdered;
            },
            getExtraTypeForPhase: function(phase) {
                return phaseToTypeLookup[phase];
            },
            getExternalContentUrl: function(contentType) {
                var extras = this.getExtra();

                var extra = _.findWhere(extras, {key: 'context_' + contentType});

                return extra.action_url;
            },
            getLogo: function () {
                var icons = this.get('icons');
                if (!icons || (!icons.primary && !icons.logo)) {
                    return null;
                }

                var logo = {
                    src: icons.primary || icons.logo
                };

                var ads = this.get('content_ads');
                if (ads && ads.logo && ads.logo.url) {
                    logo.url = ads.logo.url;
                }

                return logo;
            },
            getIconIfAvailable: function (iconProperty) {
                var icons = this.get('icons');
                if (icons && iconProperty in icons) {
                    return icons[iconProperty];
                }

                return null;
            },
            getListBadge: function () {
                return this.getIconIfAvailable('list_badge');
            },
            getDetailBadge: function () {
                return this.getIconIfAvailable('detail_badge');
            },
            getRatings: function () {
                var ads = this.get('content_ads');
                return ads && ads.ratings ? ads.ratings : null;
            },
            getBooking: function () {
                var httpUrl = /^https?:\/\//i;
                var booking = this.get('booking');

                if (typeof booking === 'undefined') {
                    return null;
                }

                var url = booking.uri.match(httpUrl) ? '#d/' + this.get('id') + '/localina' : booking.uri;

                return {
                    label: booking.label,
                    action_url: booking.uri,
                    url: url
                };
            },
            getFullName: function () {
                var identity, name = this.get('title');

                if (!name) {
                    identity = this.get('identity');
                    if (identity && identity.name) {
                        name = identity.name;
                    }
                }

                return name || '';
            },
            getPrimaryAddress: function () {
                var addresses = this.get('addresses');
                return (addresses && addresses.length > 0) ? addresses[0] : {};
            },
            getStreet: function () {
                var address = this.getPrimaryAddress();

                // Special cases
                // MOB-228 Some addresses only have no, no street name
                // MOB-2175 Street number can contain more than just a simple number
                var parts = [];

                if (address.street) {
                    parts.push(address.street);
                }
                if (address.house_number) {
                    parts.push(address.house_number);
                }

                return parts.join(' ');
            },
            getCity: function () {
                var address = this.getPrimaryAddress();
                var parts = [];

                if (address.zipcode) {
                    parts.push(address.zipcode);
                }

                if (address.city) {
                    parts.push(address.city);
                }

                return parts.join(' ');
            },
            // Sample entries with PO box: 041 811 18 01
            getPOBoxNumber: function () {
                var address = this.getPrimaryAddress();
                return address.pobox_number || '';
            },
            getPOBoxLcation: function () {
                var address = this.getPrimaryAddress();
                return address.pobox_location || '';
            },
            getFullLocation: function () {
                return this.get('subtitle');
            },
            getUnescapedFullLocation: function () {
                var encodedStr = this.getFullLocation();
                return $('<div/>').html(encodedStr).text();
            },
            getCategories: function (attribute) {
                var business = this.get('business');

                if (!business || !business.categories) {
                    return '';
                }

                return _.pluck(business.categories, 'name').join(', ');
            },
            getContext: function () {
                return this.get('context') || '';
            },
            getOccupation: function () {
                var business = this.get('business');

                if (business && business.occupation) {
                    return business.occupation;
                }

                return '';
            },
            getCoords: function () {
                var location = this.get('location');

                if (location && location.longitude && location.latitude) {
                    return {
                        longitude: location.longitude,
                        latitude: location.latitude,
                    };
                }

                return null;
            },
            getDistance: function () {
                var distanceMeters = this.get('distance');

                if (distanceMeters) {
                    return formatDistance(distanceMeters);
                }
                return '';
            },
            getPublicTransportDirectionsUrl: function (currentLocation) {
                var date, params, url;

                date = new Date();

                params = {
                    profile : 'C4',
                    REQ0JourneyStopsZ0A : '7',
                    REQ0JourneyStopsS0A : '7',
                    start : '1',
                    S : currentLocation || '',
                    Z : this.getUnescapedFullLocation(),
                    V1 : '',
                    timesel : 'depart',
                    date : date.getDay() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear(),
                    time : date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes()
                };

                url = 'http://fahrplan.sbb.ch/bin/query.exe/' + translations.getLanguage().substring(0, 1) + 'ox?' + $.param(params);
                return url;
            },
            getCarDirectionsUrl: function (currentLocation) {
                var currentLocationParam = currentLocation ? '&saddr=' + currentLocation : '';
                return platform.getMapsProviderUrl('f=d' + currentLocationParam + '&daddr=' + escape(this.getUnescapedFullLocation()));
            },
            getAreaMapUrl: function () {
                return platform.getMapsProviderUrl('q=' + this.get('location').latitude + ',' + this.get('location').longitude);
            },
            getEntryType: function () {
                var type = this.get('entry_type');

                // Fallback to POI
                if (!type || type === 'OpenPlace') {
                    return 'poi';
                }

                return type.toLowerCase();
            },
            getThumbnail: function () {
                var icons = this.get('icons');
                if (!icons || !icons.thumbnail || !icons.thumbnail_type) return {};

                return {
                    src: icons.thumbnail_type === 'photo' ? images.getThumbnail(icons.thumbnail, '64x64') : icons.thumbnail,
                    type: icons.thumbnail_type
                };
            },
            getOffers: function () {
                var useSmallThumbnail = this.get('rowType') === 'ad_mpm';
                var ads = this.get('content_ads');

                if (ads && ads.mba_offers) {
                    $.each(ads.mba_offers, function(i, offer) {
                        offer.thumbnail = images.getThumbnail(offer.photo, '100x100');
                        if (useSmallThumbnail) {
                            offer.small_thumbnail = images.getThumbnail(offer.photo, '64x42');
                        }
                    });

                    return ads.mba_offers;
                }
            },
            getOffer: function (id) {
                var offers, offer, i;

                offers = this.getOffers();

                for (i = offers.length - 1; i >= 0; i -= 1) {
                    offer = offers[i];

                    if (offer.id === id) {
                        return offer;
                    }
                }

            },
            hasOffers: function () {
                return !!this.getOffers();
            },
            getOffersType: function () {
                var offers = this.getOffers();

                if (!_.size(offers)) {
                    return;
                }

                return offers[0].type;
            },
            getCoverOffer: function () {
                var offers = this.getOffers();
                var count = _.size(offers);

                if (!count) {
                    return;
                }

                return offers[0];
            },
            getFoursquareVenueId: function () {
                var ads = this.get('content_ads');

                if (ads && ads.foursquare) {
                    return ads.foursquare.id;
                }

                return null;
            },
            getOpeningHours: function () {
                var extraOpeningHours = null, openingHours = null, ads = this.get('content_ads');

                if (ads && 'opening_hours_groups' in ads) {
                    openingHours = ads['opening_hours_groups'].map(function(group) {
                        return {
                            text: group.days,
                            subtitle: group['is_closed'] ? $.t('opening_hours_closed') : group.times.join(', '),
                            isOpen: group['is_closed'] ? false : true
                        };
                    });
                }

                if (ads && 'opening_hours' in ads && 'rows' in ads['opening_hours']) {
                    extraOpeningHours = _.compact(ads['opening_hours']['rows'].map(function (row) {
                        return (row.type === 'extra') ? { text: row.text } : null;
                    }));
                    openingHours = (openingHours || []).concat(extraOpeningHours);
                }

                return openingHours;
            },
            getVenueDataGroup: function(venueData, key) {
                if (!venueData[key]) {
                    return null;
                }

                var value = venueData[key];

                // Price level is not an array, so we normalize everything here
                return {
                    key: key,
                    items: _.isArray(value) ? value : [value]
                };
            },
            getVenueData: function () {
                var ads = this.get('content_ads');
                var order = ['foodtypes', 'ambiance', 'awards', 'geo', 'services', 'pricelevel'];

                if (ads && 'venue' in ads) {
                    return _.compact(_.map(order, function(key) { return this.getVenueDataGroup(ads.venue, key); }, this));
                }

                return null;
            },
            getShortDescription: function () {
                var lbx = this.get('local_business');
                if (lbx && 'quote' in lbx) {
                    return lbx.quote;
                }

                return null;
            },
            getDetailOrder: function () {
                var lbx = this.get('local_business');
                if (lbx && 'detailorder' in lbx) {
                    return lbx.detailorder.split(',');
                }
                // Typical, default detail order
                return 'offers,venuerating,phones,mobiles,websites,emails,address,foursquare,categories,map,quote,openinghours,venuedata,faxes,actions'.split(',');
            },
            getImages: function () {
                var ads = this.get('content_ads');

                if (ads && ads.images) {
                    return _.map(ads.images, function (imageInfo) {
                        return imageInfo.url;
                    });
                }

                return null;
            }
        });
    }
);
