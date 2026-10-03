local AddonName, ns = ...

local pt = print

_BiaoGeAccounts = {}

BiaoGeAccounts = {}
local tbl = {
    "PlayerItemsLevel",
    "playerInfo",
    "FBCD",
    "Money",
    "QuestCD",
    "tradeSkillCooldown",
    "HistoryList",
    "History",
    "equip",
    "realmName",
    "accountName",
    "bag",
    "RaidCD",
    "MONEY",
    "worldBossCD",
    "roleOverviewNote",
    "buffCD",
    "legendaryCloak",
}
for _, NAME in ipairs(tbl) do
    BiaoGeAccounts[NAME] = {}
end

local f = CreateFrame("Frame")
f:RegisterEvent("ADDON_LOADED")
f:SetScript("OnEvent", function(self, event, addonName)
    if addonName ~= 'BiaoGeAccounts' then return end
    self:UnregisterEvent(event)
    for i in ipairs(_BiaoGeAccounts) do
        for typeName in pairs(_BiaoGeAccounts[i]) do
            if BiaoGeAccounts[typeName] then
                if typeName == "HistoryList" then
                    for FB in pairs(_BiaoGeAccounts[i][typeName]) do
                        BiaoGeAccounts[typeName][FB] = BiaoGeAccounts[typeName][FB] or {}
                        for _, value in ipairs(_BiaoGeAccounts[i][typeName][FB]) do
                            tinsert(BiaoGeAccounts[typeName][FB], value)
                        end
                    end
                elseif typeName == "History" then
                    for FB in pairs(_BiaoGeAccounts[i][typeName]) do
                        BiaoGeAccounts[typeName][FB] = BiaoGeAccounts[typeName][FB] or {}
                        for DT, value in pairs(_BiaoGeAccounts[i][typeName][FB]) do
                            if not (BiaoGe[typeName] and BiaoGe[typeName][FB] and BiaoGe[typeName][FB] and BiaoGe[typeName][FB][DT]) then
                                BiaoGeAccounts[typeName][FB][DT] = value
                            end
                        end
                    end
                elseif typeName == "realmName" then
                    for realmID,realmName in pairs(_BiaoGeAccounts[i][typeName]) do
                        BiaoGeAccounts[typeName][realmID] = realmName
                    end
                else
                    for realmID in pairs(_BiaoGeAccounts[i][typeName]) do
                        if type(realmID) == "number" then
                            BiaoGeAccounts[typeName][realmID] = BiaoGeAccounts[typeName][realmID] or {}
                            for name, value in pairs(_BiaoGeAccounts[i][typeName][realmID]) do
                                if not (BiaoGe[typeName] and BiaoGe[typeName][realmID] and BiaoGe[typeName][realmID] and BiaoGe[typeName][realmID][name]) then
                                    BiaoGeAccounts[typeName][realmID][name] = value
                                end
                            end
                        end
                    end
                    if typeName == "playerInfo" then
                        BiaoGeAccounts.accountName[_BiaoGeAccounts[i][typeName].accountName] = _BiaoGeAccounts[i][typeName]
                    end
                end
            end
        end
    end
    _BiaoGeAccounts = nil
end)
