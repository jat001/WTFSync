package main

import (
	"cmp"
	"embed"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/wowsims/forever/tools/db2tool/tact"
	"github.com/wowsims/forever/tools/db2tool/wdc"
)

//go:embed definitions/manifest.json
//go:embed definitions/definitions/Item.dbd definitions/definitions/ItemSparse.dbd definitions/definitions/ItemSet.dbd definitions/definitions/ItemSetSpell.dbd
//go:embed definitions/definitions/ItemSubClass.dbd definitions/definitions/ItemEffect.dbd definitions/definitions/ItemXItemEffect.dbd
//go:embed definitions/definitions/ItemAppearance.dbd definitions/definitions/ItemModifiedAppearance.dbd
//go:embed definitions/definitions/ArmorLocation.dbd definitions/definitions/ItemArmorTotal.dbd definitions/definitions/ItemArmorQuality.dbd definitions/definitions/ItemArmorShield.dbd definitions/definitions/RandPropPoints.dbd
//go:embed definitions/definitions/ItemDamageOneHand.dbd definitions/definitions/ItemDamageOneHandCaster.dbd definitions/definitions/ItemDamageTwoHand.dbd definitions/definitions/ItemDamageTwoHandCaster.dbd definitions/definitions/ItemDamageRanged.dbd definitions/definitions/ItemDamageThrown.dbd definitions/definitions/ItemDamageWand.dbd
//go:embed definitions/definitions/Spell.dbd definitions/definitions/SpellName.dbd definitions/definitions/SpellEffect.dbd definitions/definitions/SpellMisc.dbd definitions/definitions/SpellDuration.dbd
//go:embed definitions/definitions/GemProperties.dbd definitions/definitions/SpellItemEnchantment.dbd definitions/definitions/SpellItemEnchantmentCondition.dbd
//go:embed definitions/definitions/UiTextureAtlas.dbd definitions/definitions/UiTextureAtlasMember.dbd definitions/definitions/UiTextureAtlasElement.dbd
var definitions embed.FS

type row map[string]any
type rows map[int32]row
type idSet map[int32]bool

type tableFile struct {
	Name       string `json:"tableName"`
	FileDataID uint32 `json:"db2FileDataID"`
	Hash       string `json:"tableHash"`
}

type request struct {
	Items             []int32
	Enchants          []int32
	IconIDs           []int32 `json:"icon_ids"`
	KnownIcons        []int32 `json:"known_icons"`
	KnownSocketFrames []int32 `json:"known_socket_frames"`
	SocketArt         bool    `json:"socket_art"`
}

type socketRegion struct {
	File   int32 `json:"file"`
	Left   int32 `json:"left"`
	Top    int32 `json:"top"`
	Width  int32 `json:"width"`
	Height int32 `json:"height"`
}

type result struct {
	SocketAtlases map[int32][]byte       `json:"socketAtlases,omitempty"`
	SocketRegions map[int32]socketRegion `json:"socketRegions,omitempty"`
	Tables        map[string]rows        `json:"tables"`
	Icons         map[int32][]byte       `json:"icons"`
	Incomplete    bool                   `json:"incomplete"`
}

type dataset struct {
	storage          *casc
	fallbackProducts []string
	product          string
	build            uint32
	files            map[string]tableFile
	schemas          schemaStore
	hotfix           *wdc.HotfixReader
	decoded          result
}

func integer(value any) int32 {
	if n, ok := value.(int64); ok {
		return int32(n)
	}
	return 0
}

func idsFrom(records rows, column string) idSet {
	ids := idSet{}
	for _, r := range records {
		switch values := r[column].(type) {
		case int64:
			if values > 0 {
				ids[int32(values)] = true
			}
		case []int64:
			for _, n := range values {
				if n > 0 {
					ids[int32(n)] = true
				}
			}
		}
	}
	return ids
}

type tableRows struct {
	entries []wdc.Row
	columns map[string]int
}

func (d *dataset) table(name string) (tableRows, error) {
	file := d.files[name]
	raw, err := d.storage.read(file.FileDataID, 96<<20, fillEncrypted)
	if err != nil {
		return tableRows{}, err
	}
	// The unmodified WDC reader takes a file path.
	tmp, err := os.CreateTemp("", "wtfsync-db2-*")
	if err != nil {
		return tableRows{}, err
	}
	defer os.Remove(tmp.Name())
	_, writeErr := tmp.Write(raw)
	closeErr := tmp.Close()
	if writeErr != nil {
		return tableRows{}, writeErr
	}
	if closeErr != nil {
		return tableRows{}, closeErr
	}
	table, err := wdc.ReadFile(tmp.Name())
	if err != nil {
		return tableRows{}, err
	}
	if fmt.Sprintf("%08X", table.TableHash) != file.Hash {
		return tableRows{}, fmt.Errorf("%s: unexpected DB2 table hash %08X", name, table.TableHash)
	}
	// WDC5 stores the layout hash after its 136-byte prefix and five header fields.
	// ReadFile above validates the signature and full header before this access.
	const layoutHashOffset = 156
	hash := fmt.Sprintf("%08X", binary.LittleEndian.Uint32(raw[layoutHashOffset:]))
	schema, err := d.schemas.resolve(name, hash, d.build)
	if err != nil {
		return tableRows{}, err
	}
	decoded, err := table.DecodeRows(schema.definition, schema.layout, d.build)
	if err != nil {
		return tableRows{}, err
	}
	if d.hotfix != nil {
		if _, _, err := d.hotfix.ApplyHotfixes(table, schema.definition, schema.layout, d.build, decoded); err != nil {
			return tableRows{}, err
		}
	}
	if schema.downloaded != nil {
		d.schemas.save(name, schema.downloaded)
	}
	columns := map[string]int{}
	for index, col := range schema.layout.Definitions {
		columns[col.Name] = index
	}
	return tableRows{decoded.Rows, columns}, nil
}

func (t tableRows) field(entry wdc.Row, column string) any {
	if index, found := t.columns[column]; found {
		return entry.Values[index]
	}
	return nil
}

func (t tableRows) selectRows(ids idSet, key, fields string) rows {
	out := rows{}
	columns := strings.Fields(fields)
	project := func(entry wdc.Row) {
		record := row{}
		for _, column := range columns {
			if v := t.field(entry, column); v != nil {
				record[column] = v
			}
		}
		out[entry.ID] = record
	}
	if ids != nil && key == "" {
		for id := range ids {
			if index, ok := slices.BinarySearchFunc(t.entries, id, func(entry wdc.Row, id int32) int {
				return cmp.Compare(entry.ID, id)
			}); ok {
				project(t.entries[index])
			}
		}
		return out
	}
	for _, entry := range t.entries {
		id := entry.ID
		lookup := id
		if key != "" {
			lookup = integer(t.field(entry, key))
		}
		if ids == nil || ids[lookup] {
			project(entry)
		}
	}
	return out
}

func (d *dataset) scan(name string, visit func(int32, func(string) any)) error {
	table, err := d.table(name)
	if err != nil {
		return err
	}
	for _, entry := range table.entries {
		visit(entry.ID, func(column string) any { return table.field(entry, column) })
	}
	return nil
}

func (d *dataset) selectRows(name string, ids idSet, key, fields string) (rows, error) {
	if ids != nil && len(ids) == 0 {
		return rows{}, nil
	}
	table, err := d.table(name)
	return table.selectRows(ids, key, fields), err
}

func (d *dataset) optional(name string, ids idSet, key, fields string) rows {
	out, err := d.selectRows(name, ids, key, fields)
	if err != nil {
		d.decoded.Incomplete = true
	}
	d.decoded.Tables[name] = out
	return out
}

var spellReference = regexp.MustCompile(`\$(?:@spell(?:name|desc|tooltip))?(\d+)[sdmtSDMT]?`)

// The enchantment table's localized Name is the stat line on the item.
// Application spells carry the original name and full localized description.
func enchantSpells(table tableRows, enchants idSet) map[int32][]int32 {
	candidates := map[int32][]int32{}
	if len(enchants) == 0 {
		return candidates
	}
	for _, entry := range table.entries {
		const enchantItem = 53
		const enchantPrismatic = 156
		effect := integer(table.field(entry, "Effect"))
		if integer(table.field(entry, "DifficultyID")) != 0 || (effect != enchantItem && effect != enchantPrismatic) {
			continue
		}
		misc, _ := table.field(entry, "EffectMiscValue").([]int64)
		if len(misc) == 0 || !enchants[int32(misc[0])] {
			continue
		}
		id := int32(misc[0])
		if spell := integer(table.field(entry, "SpellID")); spell > 0 && !slices.Contains(candidates[id], spell) {
			candidates[id] = append(candidates[id], spell)
		}
	}
	return candidates
}

func (d *dataset) linkEnchantSpells(candidates map[int32][]int32, names, spells rows) {
	links := rows{}
	for enchant, ids := range candidates {
		slices.Sort(ids)
		var chosen int32
		for _, id := range ids {
			if name, _ := names[id]["Name_lang"].(string); name == "" {
				continue
			}
			if chosen == 0 {
				chosen = id
			}
			if description, _ := spells[id]["Description_lang"].(string); description != "" {
				chosen = id
				break
			}
		}
		if chosen != 0 {
			links[enchant] = row{"SpellID": chosen}
		}
	}
	d.decoded.Tables["EnchantSpell"] = links
}

// Texture atlas member names are the socket frame names used by FrameXML.
func (d *dataset) loadSocketArt(known []int32) {
	frames := map[string]int32{
		"socket-meta-closed":      1,
		"socket-red-closed":       2,
		"socket-yellow-closed":    3,
		"socket-blue-closed":      4,
		"socket-cogwheel-closed":  6,
		"socket-prismatic-closed": 7,
	}
	for name, id := range frames {
		if slices.Contains(known, id) {
			delete(frames, name)
		}
	}
	if len(frames) == 0 {
		return
	}
	elements := map[int32]string{}
	_ = d.scan("UiTextureAtlasElement", func(id int32, field func(string) any) {
		if name, _ := field("Name").(string); frames[name] != 0 {
			elements[id] = name
		}
	})
	atlases := idSet{}
	regions := map[int32]socketRegion{}
	if err := d.scan("UiTextureAtlasMember", func(_ int32, field func(string) any) {
		name, _ := field("CommittedName").(string)
		if frames[name] == 0 {
			name = elements[integer(field("UiTextureAtlasElementID"))]
		}
		key := frames[name]
		if key == 0 || regions[key].File != 0 {
			return
		}
		left := integer(field("CommittedLeft"))
		top := integer(field("CommittedTop"))
		width := integer(field("CommittedRight")) - left
		height := integer(field("CommittedBottom")) - top
		atlas := integer(field("UiTextureAtlasID"))
		if left >= 0 && top >= 0 && width > 0 && height > 0 && width <= 256 && height <= 256 && atlas > 0 {
			regions[key] = socketRegion{File: atlas, Left: left, Top: top, Width: width, Height: height}
			atlases[atlas] = true
		}
	}); err != nil || len(regions) == 0 {
		return
	}
	records, err := d.selectRows("UiTextureAtlas", atlases, "", "FileDataID")
	if err != nil {
		return
	}
	d.decoded.SocketAtlases = map[int32][]byte{}
	d.decoded.SocketRegions = map[int32]socketRegion{}
	for key, region := range regions {
		region.File = integer(records[region.File]["FileDataID"])
		if region.File <= 0 {
			continue
		}
		if d.decoded.SocketAtlases[region.File] == nil {
			raw, err := d.storage.read(uint32(region.File), 8<<20, 0)
			if err != nil {
				continue
			}
			d.decoded.SocketAtlases[region.File] = raw
		}
		d.decoded.SocketRegions[key] = region
	}
}

func (d *dataset) load(req request, preview func(result) error) error {
	if len(req.Items) == 0 && len(req.Enchants) == 0 {
		d.loadImages(idSet{}, req)
		return nil
	}
	itemIDs, enchants, appliedEnchants := idSet{}, idSet{}, idSet{}
	for _, id := range req.Items {
		if id > 0 {
			itemIDs[id] = true
		}
	}
	for _, id := range req.Enchants {
		if id > 0 {
			enchants[id] = true
			appliedEnchants[id] = true
		}
	}
	fields := "Display_lang ItemLevel OverallQualityID InventoryType RequiredLevel AllowableClass Bonding SocketType Socket_match_enchantment_ID Gem_properties ItemSet StatModifier_bonusStat StatModifier_bonusAmount Resistances MaxDurability MinDamage MaxDamage ItemDelay Description_lang"
	if d.product == "wowf" {
		fields += " StatPercentEditor DmgVariance Flags"
	}
	var sparseTable tableRows
	if len(itemIDs) > 0 {
		var err error
		sparseTable, err = d.table("ItemSparse")
		if err != nil {
			return fmt.Errorf("ItemSparse: %w", err)
		}
	}
	sparse := sparseTable.selectRows(itemIDs, "", fields)
	d.decoded.Tables["ItemSparse"] = sparse
	item := d.optional("Item", itemIDs, "", "ClassID SubclassID IconFileDataID MaxDurability Resistances MinDamage MaxDamage")
	d.fillAppearanceIcons(item)
	if len(idsFrom(sparse, "Gem_properties")) > 0 || len(idsFrom(sparse, "SocketType")) > 0 {
		req.SocketArt = true
	}
	d.loadImages(idsFrom(item, "IconFileDataID"), req)
	if preview != nil {
		first := d.decoded
		first.Tables = map[string]rows{
			"Item":       item,
			"ItemSparse": sparseTable.selectRows(itemIDs, "", "ItemLevel Gem_properties SocketType"),
		}
		if err := preview(first); err != nil {
			return err
		}
		d.decoded.Icons = map[int32][]byte{}
		d.decoded.SocketAtlases = nil
		d.decoded.SocketRegions = nil
	}
	if d.product == "wowf" {
		d.fillForeverItemStats(sparse, item)
	}
	setIDs := idsFrom(sparse, "ItemSet")
	sets := d.optional("ItemSet", setIDs, "", "Name_lang ItemID")
	d.decoded.Tables["Pieces"] = sparseTable.selectRows(idsFrom(sets, "ItemID"), "", "Display_lang InventoryType")
	bonuses := d.optional("ItemSetSpell", setIDs, "ItemSetID", "ItemSetID Threshold SpellID ChrSpecID")
	gems := d.optional("GemProperties", idsFrom(sparse, "Gem_properties"), "", "Enchant_ID Type")
	for id := range idsFrom(gems, "Enchant_ID") {
		enchants[id] = true
	}
	for id := range idsFrom(sparse, "Socket_match_enchantment_ID") {
		enchants[id] = true
	}
	enchant := d.optional("SpellItemEnchantment", enchants, "", "Name_lang Condition_ID EffectPointsMin EffectScalingPoints")
	d.optional("SpellItemEnchantmentCondition", idsFrom(enchant, "Condition_ID"), "", "Lt_operandType Operator Rt_operandType Rt_operand Logic")
	d.optional("ItemSubClass", nil, "", "ClassID SubClassID DisplayName_lang")
	effects := rows{}
	var effectTable tableRows
	if len(itemIDs) > 0 {
		var err error
		effectTable, err = d.table("ItemEffect")
		if err != nil {
			d.decoded.Incomplete = true
		}
		effects = effectTable.selectRows(itemIDs, "ParentItemID", "ParentItemID SpellID TriggerType CoolDownMSec")
	}
	d.decoded.Tables["ItemEffect"] = effects
	// The relationship moved into a separate table on some clients.
	links, linkErr := d.selectRows("ItemXItemEffect", itemIDs, "ItemID", "ItemID ItemEffectID")
	if linkErr == nil && len(links) > 0 {
		entries := effectTable.selectRows(idsFrom(links, "ItemEffectID"), "", "SpellID TriggerType CoolDownMSec")
		for id, link := range links {
			if r := entries[integer(link["ItemEffectID"])]; r != nil {
				effects[-id] = row{"ParentItemID": link["ItemID"], "SpellID": r["SpellID"], "TriggerType": r["TriggerType"], "CoolDownMSec": r["CoolDownMSec"]}
			}
		}
	}
	var spellEffectTable tableRows
	loadSpellEffects := func() {
		var err error
		spellEffectTable, err = d.table("SpellEffect")
		if err != nil {
			d.decoded.Incomplete = true
		}
	}
	if len(appliedEnchants) > 0 {
		loadSpellEffects()
	}
	candidates := enchantSpells(spellEffectTable, appliedEnchants)
	enchantSpellIDs := idSet{}
	for _, ids := range candidates {
		for _, id := range ids {
			enchantSpellIDs[id] = true
		}
	}
	names := d.optional("SpellName", enchantSpellIDs, "", "Name_lang")
	spellIDs := idsFrom(effects, "SpellID")
	for id := range enchantSpellIDs {
		spellIDs[id] = true
	}
	for id := range idsFrom(bonuses, "SpellID") {
		spellIDs[id] = true
	}
	if len(spellIDs) > 0 {
		spells, err := d.table("Spell")
		if err != nil {
			d.decoded.Incomplete = true
		}
		d.linkEnchantSpells(candidates, names, spells.selectRows(enchantSpellIDs, "", "Description_lang"))
		selected := rows{}
		dependencies := idSet{}
		pending := spellIDs
		for len(pending) > 0 {
			next := idSet{}
			batch := spells.selectRows(pending, "", "Description_lang")
			for id := range pending {
				if dependencies[id] {
					continue
				}
				dependencies[id] = true
				if batch[id] == nil {
					continue
				}
				selected[id] = batch[id]
				desc, _ := batch[id]["Description_lang"].(string)
				for _, match := range spellReference.FindAllStringSubmatch(desc, -1) {
					target, _ := strconv.ParseInt(match[1], 10, 32)
					if target > 0 && !dependencies[int32(target)] {
						next[int32(target)] = true
					}
				}
			}
			pending = next
		}
		d.decoded.Tables["Spell"] = selected
		if len(appliedEnchants) == 0 {
			loadSpellEffects()
		}
		d.decoded.Tables["SpellEffect"] = spellEffectTable.selectRows(dependencies, "SpellID", "SpellID DifficultyID EffectIndex EffectBasePoints EffectBasePointsF EffectDieSides EffectAura EffectAuraPeriod EffectRadiusIndex")
		misc := d.optional("SpellMisc", dependencies, "SpellID", "SpellID DifficultyID DurationIndex")
		d.optional("SpellDuration", idsFrom(misc, "DurationIndex"), "", "Duration")
	}
	return nil
}

func (d *dataset) loadImages(ids idSet, req request) {
	for _, id := range req.IconIDs {
		if id > 0 {
			ids[id] = true
		}
	}
	for _, id := range req.KnownIcons {
		delete(ids, id)
	}
	missing := map[int32]contentKey{}
	for id := range ids {
		data, key := d.storage.readIcon(uint32(id))
		if data != nil {
			d.decoded.Icons[id] = data
		} else if key != (contentKey{}) {
			missing[id] = key
		}
	}
	// Products share the local archive, but may use different encodings of the same content.
	for _, product := range d.fallbackProducts {
		if len(missing) == 0 {
			break
		}
		storage, err := openCasc(d.storage.dll.Name, d.storage.root, product)
		if err != nil {
			continue
		}
		for id, key := range missing {
			if data := storage.readIconByContentKey(key); data != nil {
				d.decoded.Icons[id] = data
				delete(missing, id)
			}
		}
		storage.close()
	}
	if req.SocketArt {
		d.loadSocketArt(req.KnownSocketFrames)
	}
}

func openDataset(dir, dll, cacheDir string) (*dataset, error) {
	flavor, err := os.ReadFile(filepath.Join(dir, ".flavor.info"))
	if err != nil {
		return nil, err
	}
	fields := strings.Fields(string(flavor))
	if len(fields) == 0 {
		return nil, fmt.Errorf("missing product")
	}
	product := fields[len(fields)-1]
	validProduct := regexp.MustCompile(`^wow[a-z0-9_]*$`)
	if !validProduct.MatchString(product) {
		return nil, fmt.Errorf("invalid product")
	}
	root := filepath.Dir(dir)
	entries, err := tact.ParseBuildInfo(filepath.Join(root, ".build.info"))
	if err != nil {
		return nil, err
	}
	entry, err := tact.SelectBuild(entries, product)
	if err != nil {
		return nil, err
	}
	build, err := tact.BuildNumber(entry.Version)
	if err != nil {
		return nil, err
	}
	var manifest []tableFile
	raw, err := definitions.ReadFile("definitions/manifest.json")
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, err
	}
	files := map[string]tableFile{}
	for _, record := range manifest {
		files[record.Name] = record
	}
	storage, err := openCasc(dll, root, product)
	if err != nil {
		return nil, err
	}
	d := &dataset{storage: storage, product: product, build: build, files: files, schemas: schemaStore{cacheDir: cacheDir}}
	for _, entry := range entries {
		if entry.Product != product && validProduct.MatchString(entry.Product) && !slices.Contains(d.fallbackProducts, entry.Product) {
			d.fallbackProducts = append(d.fallbackProducts, entry.Product)
		}
	}
	hotfix, err := wdc.ReadHotfixFile(filepath.Join(dir, "Cache", "ADB", "zhCN", "DBCache.bin"))
	if err == nil && uint32(hotfix.BuildID) == build {
		d.hotfix = hotfix
	}
	return d, nil
}

func (d *dataset) query(req request, preview func(result) error) (result, error) {
	d.decoded = result{Tables: map[string]rows{}, Icons: map[int32][]byte{}, Incomplete: d.hotfix == nil}
	defer func() {
		d.decoded = result{}
		d.schemas.close()
		d.schemas = schemaStore{cacheDir: d.schemas.cacheDir}
	}()
	err := d.load(req, preview)
	return d.decoded, err
}

type message struct {
	Stage string  `json:"stage"`
	Data  *result `json:"data,omitempty"`
	Error string  `json:"error,omitempty"`
}

func run(args []string) error {
	session := len(args) > 0 && args[0] == "--session"
	if session {
		args = args[1:]
	}
	if len(args) < 2 || len(args) > 3 {
		return fmt.Errorf("expected game directory, CascLib path, and optional definition cache path")
	}
	cacheDir := ""
	if len(args) == 3 {
		cacheDir = args[2]
		if !filepath.IsAbs(cacheDir) {
			return fmt.Errorf("definition cache path must be absolute")
		}
	}
	out := json.NewEncoder(os.Stdout)
	d, err := openDataset(args[0], args[1], cacheDir)
	if err != nil {
		return err
	}
	defer d.storage.close()
	if !session {
		var req request
		if err := json.NewDecoder(io.LimitReader(os.Stdin, 1<<20)).Decode(&req); err != nil {
			return err
		}
		data, err := d.query(req, nil)
		if err != nil {
			return err
		}
		return out.Encode(data)
	}
	in := json.NewDecoder(os.Stdin)
	for {
		var req request
		if err := in.Decode(&req); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		data, err := d.query(req, func(first result) error {
			return out.Encode(message{Stage: "preview", Data: &first})
		})
		reply := message{Stage: "complete", Data: &data}
		if err != nil {
			reply = message{Stage: "error", Error: err.Error()}
		}
		if err := out.Encode(reply); err != nil {
			return err
		}
	}
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		if len(os.Args) > 1 && os.Args[1] == "--session" {
			_ = json.NewEncoder(os.Stdout).Encode(message{Stage: "error", Error: err.Error()})
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
