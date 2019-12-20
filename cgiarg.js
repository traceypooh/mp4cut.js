/* eslint-disable semi */
/**
 * Parses a CGI arg
 *
 * @param {string} theArgName - CGI argument name to look for
 * @param {boolean} try_full - if no '?' is present in url, instead of always thus returning '',
 *                             try spliting entire url by '&' chars
 *                               eg: /details/commute&autoplay=1
 */
function cgiarg(theArgName, try_full) {
  const sArgs = (try_full  &&  location.search === ''
    ? location.href.slice(1).split('&')
    : location.search.slice(1).split('&')
  )
  for (let i = 0; i < sArgs.length; i++) {
    if (sArgs[i].slice(0, sArgs[i].indexOf('=')) === theArgName) {
      const r = sArgs[i].slice(sArgs[i].indexOf('=') + 1)
      return (r.length > 0 ? unescape(r) : '')
    }
  }
  return ''
}


export { cgiarg as default }
