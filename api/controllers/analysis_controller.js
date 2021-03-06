'use strict'
require('dotenv').config()

const db = require("../../src/database");

const {performMatchAnalysis, playerInfoFromAnalysis, getWinFromAnalysis, getRaramSearchedGames} = require("../../utils/analysis_helper")
const {leagueJs} = require('../../src/league')

exports.match_analysis = async function (req, res){
    const dev = req.query.dev !== undefined ?? false

    const summonerData = await leagueJs.Summoner.gettingByName(req.params.name)
    const accountId = summonerData["accountId"]
    const user = await db.getSummonerByName([req.params.name])
    let limit

    const options = {"queue": [450]}
    if(dev || user.rowCount === 0){
        limit = 1
        options["endIndex"] = limit
    } else {
        const requirements = await db.getUserTimer([accountId])

        limit = requirements.rows[0]["raram_amount"]
        options["beginTime"] = new Date(requirements.rows[0]["raram_date"]).getTime()
    }

    // eslint-disable-next-line no-alert, quotes, semi
    const matchList = await leagueJs.Match.gettingListByAccount(accountId, "euw1", options).catch(() => {
        return res.json({"error": "No match data could be found"}).status(404).end()
    })

    // I do not know why the previous .catch does not return correctly.
    if(matchList["matches"] === undefined) return;

    const matches = getRaramSearchedGames(matchList["matches"], limit)
    const userData = await db.getUserByAccountId([accountId])
    const isRaramUser = userData.rowCount === 0

    const analysisResult = []

    // User has no raram account, just display info
    if(!isRaramUser){
        analysisResult["raram"] = "Could not find a raram account linked to the search"
    }

    for(let i=0; i<matches.length; i++){
        const matchData = await leagueJs.Match.gettingById(matches[i]["gameId"])

        const matchAnalysis = performMatchAnalysis(matchData)
        const playerData = playerInfoFromAnalysis(matchAnalysis, accountId)

        analysisResult.push(matchAnalysis)

        const dbMatch = await db.getMatchByIds([matchData["gameId"], accountId])
        console.log('Analyzed match: ' + playerData["summonerName"] + ' played ' + playerData["champion"] + ' and gained ' + playerData["lpGain"] + ' LP.')

        // If the game has not been added to the database previously
        if(dbMatch.rowCount === 0){
            console.log('and added it to db!')

            await db.insertMatch([matchData["gameId"], accountId, playerData["championId"], matchAnalysis["match"]["gameCreation"], playerData["lpGain"]])
            await db.updatePlayerLP([accountId])

            await db.updatePlayerStats([
                accountId,
                playerData["kills"],
                playerData["deaths"],
                playerData["assists"],
                getWinFromAnalysis(matchAnalysis, accountId) ? 1 : 0,
                playerData["damageDone"],
                playerData["damageTaken"],
                playerData["healed"],
                playerData["doubleKills"],
                playerData["tripleKills"],
                playerData["quadraKills"],
                playerData["pentaKills"],
                playerData["goldEarned"],
                playerData["goldSpent"],
                playerData["totalMinionsKilled"],
                playerData["firstBloodKill"] ? 1 : 0,
                playerData["longestTimeSpentLiving"]
            ])

            await db.updateHighestWinstreak([accountId])
        }
    }

    return res.json(analysisResult).status(200).end();
}

exports.only_analysis = async function (req, res){
    if(req.params.gameId === undefined)
        return res.json({"error": "Missing parameter matchId"}).status(404).end()

    const matchData = await leagueJs.Match.gettingById(req.params.gameId)

    if(matchData["participants"] === undefined)
        return res.json({"error": "Could not find match with received id"}).status(404).end()

    const matchAnalysis = performMatchAnalysis(matchData)

    return res.json(matchAnalysis).status(200).end()
}
