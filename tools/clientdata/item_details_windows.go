package main

import "math"

// Newer items can put their default icon on the appearance rather than Item.
func (d *dataset) fillAppearanceIcons(items rows) {
	missing := idSet{}
	for id, item := range items {
		if integer(item["IconFileDataID"]) == 0 {
			missing[id] = true
		}
	}
	if len(missing) == 0 {
		return
	}
	modified, err := d.selectRows("ItemModifiedAppearance", missing, "ItemID", "ItemID ItemAppearanceID ItemAppearanceModifierID OrderIndex")
	if err != nil {
		return
	}
	defaults := map[int32]int32{}
	for id, entry := range modified {
		if integer(entry["ItemAppearanceModifierID"]) != 0 || integer(entry["ItemAppearanceID"]) <= 0 {
			continue
		}
		item := integer(entry["ItemID"])
		old := defaults[item]
		order := integer(entry["OrderIndex"])
		oldOrder := integer(modified[old]["OrderIndex"])
		if old == 0 || order < oldOrder || (order == oldOrder && id < old) {
			defaults[item] = id
		}
	}
	appearanceIDs := idSet{}
	for _, id := range defaults {
		appearanceIDs[integer(modified[id]["ItemAppearanceID"])] = true
	}
	appearances, err := d.selectRows("ItemAppearance", appearanceIDs, "", "DefaultIconFileDataID")
	if err != nil {
		return
	}
	for item, id := range defaults {
		appearance := integer(modified[id]["ItemAppearanceID"])
		if icon := appearances[appearance]["DefaultIconFileDataID"]; integer(icon) > 0 {
			items[item]["IconFileDataID"] = icon
		}
	}
}

func decimal(value any) float64 {
	switch value := value.(type) {
	case float32:
		return float64(value)
	case int64:
		return float64(value)
	}
	return 0
}

func arrayNumber(value any, index int32) float64 {
	if index < 0 {
		return 0
	}
	switch values := value.(type) {
	case []float32:
		if int(index) < len(values) {
			return float64(values[index])
		}
	case []int64:
		if int(index) < len(values) {
			return float64(values[index])
		}
	}
	return 0
}

func budgetColumn(slot int32) int32 {
	switch slot {
	case 1, 5, 7, 17, 20:
		return 0
	case 3, 6, 8, 10, 12:
		return 1
	case 2, 9, 11, 14, 16, 23:
		return 2
	case 13, 21, 22:
		return 3
	case 15, 25, 26, 28:
		return 4
	default:
		return -1
	}
}

func weaponBudgetTable(subclass, slot int32, caster bool) string {
	switch {
	case subclass == 19:
		return "ItemDamageWand"
	case subclass == 16 || slot == 25:
		return "ItemDamageThrown"
	case subclass == 2 || subclass == 3 || subclass == 18:
		return "ItemDamageRanged"
	case slot == 17:
		if caster {
			return "ItemDamageTwoHandCaster"
		}
		return "ItemDamageTwoHand"
	default:
		if caster {
			return "ItemDamageOneHandCaster"
		}
		return "ItemDamageOneHand"
	}
}

// Forever uses item-level budgets where the older clients store literal item values.
func (d *dataset) fillForeverItemStats(sparse, items rows) {
	tables := map[string]rows{}
	lookup := func(name, fields string, id int32) row {
		if _, loaded := tables[name]; !loaded {
			records, err := d.selectRows(name, nil, "", "ItemLevel "+fields)
			if err != nil {
				d.decoded.Incomplete = true
			}
			tables[name] = rows{}
			for key, entry := range records {
				if level := integer(entry["ItemLevel"]); level > 0 {
					key = level
				}
				tables[name][key] = entry
			}
		}
		return tables[name][id]
	}
	materials := [...]string{"", "Cloth", "Leather", "Mail", "Plate"}
	locations := [...]string{"", "Clothmodifier", "Leathermodifier", "Chainmodifier", "Platemodifier"}
	for id, base := range sparse {
		item := items[id]
		level := integer(base["ItemLevel"])
		slot := integer(base["InventoryType"])
		quality := integer(base["OverallQualityID"])
		class, subclass := integer(item["ClassID"]), integer(item["SubclassID"])
		if item == nil || level <= 0 || slot <= 0 || quality < 0 {
			continue
		}
		if base["StatModifier_bonusAmount"] == nil && quality >= 2 && quality <= 6 && budgetColumn(slot) >= 0 {
			stats, _ := base["StatModifier_bonusStat"].([]int64)
			weights, _ := base["StatPercentEditor"].([]int64)
			if len(stats) > 0 && len(weights) == len(stats) {
				budget := "Epic"
				if quality == 2 {
					budget = "Good"
				} else if quality == 3 {
					budget = "Superior"
				}
				points := arrayNumber(lookup("RandPropPoints", "Epic Superior Good", level)[budget], budgetColumn(slot))
				if points > 0 {
					amounts := make([]int64, len(stats))
					for index, weight := range weights {
						if stats[index] >= 0 {
							amounts[index] = int64(math.Floor(float64(weight)*points/10_000 + 0.5))
						}
					}
					base["StatModifier_bonusAmount"] = amounts
				}
			}
		}
		if class == 4 && base["Resistances"] == nil && item["Resistances"] == nil {
			var armor float64
			switch {
			case subclass == 6:
				armor = arrayNumber(lookup("ItemArmorShield", "Quality", level)["Quality"], min(quality, 6))
			case subclass >= 1 && subclass <= 4:
				total := lookup("ItemArmorTotal", "Cloth Leather Mail Plate", level)
				factor := lookup("ArmorLocation", "Clothmodifier Leathermodifier Chainmodifier Platemodifier", slot)
				rarity := lookup("ItemArmorQuality", "Qualitymod", level)
				armor = decimal(total[materials[subclass]]) * decimal(factor[locations[subclass]]) * arrayNumber(rarity["Qualitymod"], min(quality, 6))
			}
			if armor > 0 {
				base["Resistances"] = []int64{int64(math.Round(armor))}
			}
		}
		delay := integer(base["ItemDelay"])
		if class == 2 && delay > 0 && base["MinDamage"] == nil && item["MinDamage"] == nil {
			caster := int64(arrayNumber(base["Flags"], 1))&0x200 != 0
			name := weaponBudgetTable(subclass, slot, caster)
			dps := arrayNumber(lookup(name, "Quality", level)["Quality"], min(quality, 6))
			if variance, ok := base["DmgVariance"].(float32); ok && dps > 0 && variance >= 0 && variance < 2 {
				average := dps * float64(delay) / 1_000
				halfSpread := float64(variance) / 2
				base["MinDamage"] = []int64{int64(math.Floor(average * (1 - halfSpread)))}
				base["MaxDamage"] = []int64{int64(math.Round(average * (1 + halfSpread)))}
			}
		}
		delete(base, "Flags")
		delete(base, "StatPercentEditor")
		delete(base, "DmgVariance")
	}
}
