const _ = require('lodash');

/**
 * Creates a new Map containing each champion's Id as key, and its name as value.
 * @returns {Map<number, string>}
 */
const mapChampionNameToId = () => {
    const champions = require('../data/champions.json')
    const championMap = new Map()

    _.forEach(champions.data, (c) => {
        championMap.set(parseInt(c["key"]), c["id"])
    })

    return championMap
}

/**
 * Limits a certain number with following logic: <br/>
 * * if the number is lower than min, selects min. <br/>
 * * if the number is higher than max, selects max.
 * @param gain The number that is going to get limited.
 * @param min The lowest amount allowed
 * @param max The highest amount allowed
 * @returns {number} gain if between min and max, min if lower than min, max if higher than max
 */
const limit = (gain = 0, min = -4, max = 4) => {
    return gain < 0 ? _.max([min, gain]) : _.min([gain, max])
}

/**
 * Calculates how much LP should be gained.
 * @note this is a helper function specific to my needs. You will probably never ever need it.
 * @param gain percentage that will determine pre-multiplier amount
 * @param multiplier will be multiplied with gain
 * @param resultMultiplier result of previous operation will be multiplied with resultMultiplier
 * @returns {number} 2-decimal float representing (gain*multiplier) * resultMultiplier
 */
const calculateGain = (gain, multiplier = 10, resultMultiplier = 1) => {
    return limit((gain * 10).toFixed(2) * resultMultiplier)
}

/**
 * Map containing every champion name mapped to its internal ID.
 * @type {Map<number, string>}
 */
const ChampionList = mapChampionNameToId()

/**
 * Gets the champion's name from its championId.
 * @param id champion id
 * @returns {string} the champion's name.
 */
const getChampionNameById = (id) => {
    return ChampionList.get(parseInt(id)) ?? "Not found"
}

/**
 * Formats the value provided to a 2-decimal float
 * @param value the value you wish to format
 * @returns {number} formatted value
 */
const format = (value) => {
    return parseFloat(value.toFixed(2))
}

/**
 * Finds a summoner's Identity from its participantId
 * @param matchData match data returned by Riot's API
 * @param participantId function finds identity from this participantId
 * @returns {JSON} representing a summonerDTO (see Riot's API documentation)
 */
function getParticipantIdentity(matchData, participantId) {
    return _.find(matchData["participantIdentities"], {participantId: participantId})
}

/**
 * Analyses a game coming from Riot's API
 * @param matchData comes from a GET on /lol/match/v4/matches/{matchId}
 * @returns {{teams: *[], players: *[]}} an array filled with team- and player data.
 */
exports.performMatchAnalysis = (matchData) => {
    const players = []
    const teams = []

    _.forEach(matchData["participants"], function(e){
        // Participant-related information
        const participant = {}

        const identity = getParticipantIdentity(matchData, e["participantId"])
        participant["accountId"] = identity["player"]["accountId"]
        participant["summonerName"] = identity["player"]["summonerName"]

        participant["championId"] = e["championId"]
        participant["champion"] = getChampionNameById(e["championId"])
        participant["teamId"] = e["teamId"]

        participant["kills"] = e["stats"]["kills"]
        participant["deaths"] = e["stats"]["deaths"]
        participant["assists"] = e["stats"]["assists"]

        participant["KP"] = e["stats"]["kills"] + e["stats"]["assists"]

        participant["damageDone"] = e["stats"]["totalDamageDealtToChampions"]
        participant["damageTaken"] = e["stats"]["totalDamageTaken"]
        participant["healed"] = e["stats"]["totalHeal"]

        participant["doubleKills"] = e["stats"]["doubleKills"]
        participant["tripleKills"] = e["stats"]["tripleKills"]
        participant["quadraKills"] = e["stats"]["quadraKills"]
        participant["pentaKills"] = e["stats"]["pentaKills"]

        participant["goldEarned"] = e["stats"]["goldEarned"]
        participant["goldSpent"] = e["stats"]["goldSpent"]

        participant["totalMinionsKilled"] = e["stats"]["totalMinionsKilled"]
        participant["firstBloodKill"] = e["stats"]["firstBloodKill"]
        participant["longestTimeSpentLiving"] = e["stats"]["longestTimeSpentLiving"]

        players.push(participant)

        // Team-related information
        let team = _.find(teams, {teamId: e["teamId"]})
        if(team === undefined){
            team = {
                "teamId": e["teamId"],
                "win": e["stats"]["win"],
                "totalKills": e["stats"]["kills"],
                "totalAssists": e["stats"]["assists"],
                "totalDeaths": e["stats"]["deaths"],
                "totalDamageDone": e["stats"]["totalDamageDealtToChampions"],
                "totalDamageTaken": e["stats"]["totalDamageTaken"],
                "totalHealed": e["stats"]["totalHeal"],
            }

            teams.push(team)
        } else {
            team["totalKills"] += e["stats"]["kills"]
            team["totalAssists"] += e["stats"]["assists"]
            team["totalDeaths"] += e["stats"]["deaths"]
            team["totalDamageDone"] += e["stats"]["totalDamageDealtToChampions"]
            team["totalDamageTaken"] += e["stats"]["totalDamageTaken"]
            team["totalHealed"] += e["stats"]["totalHeal"]
        }
    })

    // Calculate team-averages
    _.forEach(teams, function(team){
        team["avgKP"] = (team["totalKills"] + team["totalAssists"]) / 5
        team["avgDeaths"] = team["totalDeaths"] / 5

        team["avgDamageDone"] = team["totalDamageDone"] / 5
        team["avgDamageTaken"] = team["totalDamageTaken"] / 5
        team["avgHealed"] = team["totalHealed"] / 5
    })

    // Calculate team-comparisons and gains and total LP
    _.forEach(players, function(player){
        const team = _.find(teams, {teamId: player["teamId"]})

        player["teamComparedKP"] = format((player["KP"] - team["avgKP"]) / team["avgKP"])
        player["teamComparedDeaths"] = format((player["deaths"] - team["avgDeaths"]) / team["avgDeaths"])

        player["teamComparedDamageDone"] = format((player["damageDone"] - team["avgDamageDone"]) / team["avgDamageDone"])
        player["teamComparedDamageTaken"] = format((player["damageTaken"] - team["avgDamageTaken"]) / team["avgDamageTaken"])
        player["teamComparedHealed"] = format((player["healed"] - team["avgHealed"]) / team["avgHealed"])

        player["KPGain"] = calculateGain(player["teamComparedKP"], 10, 2)
        player["deathsGain"] = calculateGain(player["teamComparedDeaths"], 10, -1)

        player["damageDoneGain"] = calculateGain(player["teamComparedDamageDone"])
        player["damageTakenGain"] = calculateGain(player["teamComparedDamageTaken"])
        player["healedGain"] = calculateGain(player["teamComparedHealed"])

        player["lpGain"] = format((team["win"] ? 10 : -10) + player["KPGain"] + player["deathsGain"] + (_.max([player["damageDoneGain"], player["damageTakenGain"], player["healedGain"]])))
    })

    return {
        "teams": teams,
        "players": players,
        "match": {
            "gameDuration": matchData["gameDuration"],
            "gameCreation": matchData["gameCreation"],
            "queueId": matchData["queueId"],
            "gameId": matchData["gameId"]
        }
    }
}

/**
 * Returns the playerInfo part of a whole matchData using a player's accountId.
 * @param matchData returned by performMatchAnalysis()
 * @param accountId Riot API string representing the player's account identifier
 * @returns {{accountId: number, summonerName: string, ...}}
 */
exports.playerInfoFromAnalysis = (matchData, accountId) => {
    return _.find(matchData["players"], {accountId: accountId})
}

/**
 * Returns whether the player linked with accountId won the game or not.
 * @param matchData the game in question
 * @param accountId the player in question
 * @returns boolean victory
 */
exports.getWinFromAnalysis = (matchData, accountId) => {
    const player = _.find(matchData["players"], { accountId: accountId })
    const playerTeamId = player["teamId"]

    return _.find(matchData["teams"], {teamId: playerTeamId})["win"]
}

/**
 * Takes the <b>last</b> n-amount of games from gameList.
 * @param gameList the list containing all games
 * @param amount the amount to take, starting from the end
 * @returns {{unknown}[]}
 */
exports.getRaramSearchedGames = (gameList, amount) => {
    return _.takeRight(gameList, amount)
}