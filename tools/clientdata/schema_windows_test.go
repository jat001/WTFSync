package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const alternateSchema = `COLUMNS
int ID
int First
int Second

LAYOUT 12345678
BUILD 1.60.1.71037
$id$ID<32>
First<32>

LAYOUT ABCD1234
BUILD 1.60.1.71139
$id$ID<32>
Second<32>
`

func TestDefinitionMatchesTheLocalLayout(t *testing.T) {
	// The version entry can be absent or point at another layout.
	for _, build := range []uint32{99999, 71139, 71037} {
		schema, err := parseSchema([]byte(alternateSchema), "12345678", build)
		if err != nil {
			t.Fatal(err)
		}
		if schema.layout.Definitions[1].Name != "First" {
			t.Fatalf("selected the wrong definition for build %d", build)
		}
	}
	if _, err := parseSchema([]byte(alternateSchema), "DEADBEEF", 71139); err == nil {
		t.Fatal("accepted a build match with an unknown layout")
	}
}

func TestDefinitionStoreFetchesOnlyUnknownLayouts(t *testing.T) {
	dir := t.TempDir()
	store := schemaStore{
		cacheDir: dir,
		fetch: func(_ context.Context, name string) ([]byte, error) {
			if name != "ItemSparse.dbd" {
				t.Fatalf("unexpected definition request for %s", name)
			}
			return []byte(alternateSchema), nil
		},
	}
	t.Cleanup(store.close)
	if _, err := store.resolve("ItemSparse", "6FCC3191", 99999); err != nil {
		t.Fatalf("known layout should work with the embedded definitions: %v", err)
	}
	if store.deadline != nil {
		t.Fatal("known layout started the download path")
	}
	schema, err := store.resolve("ItemSparse", "ABCD1234", 71139)
	if err != nil || schema.downloaded == nil {
		t.Fatalf("expected the downloaded layout: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "ItemSparse.dbd")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("download was cached before the table could be decoded")
	}
	store.save("ItemSparse", schema.downloaded)

	offline := schemaStore{
		cacheDir: dir,
		fetch: func(_ context.Context, _ string) ([]byte, error) {
			t.Fatal("cached layout made a network request")
			return nil, nil
		},
	}
	if _, err := offline.resolve("ItemSparse", "ABCD1234", 71139); err != nil {
		t.Fatalf("cached layout should work offline: %v", err)
	}
}

func TestDefinitionStoreRejectsMismatchedDownloads(t *testing.T) {
	calls := 0
	store := schemaStore{
		cacheDir: t.TempDir(),
		fetch: func(_ context.Context, _ string) ([]byte, error) {
			calls++
			return []byte(alternateSchema), nil
		},
	}
	t.Cleanup(store.close)
	for range 2 {
		if _, err := store.resolve("ItemSparse", "DEADBEEF", 71139); err == nil {
			t.Fatal("accepted a downloaded definition for a different layout")
		}
	}
	if calls != 1 {
		t.Fatalf("download attempts = %d, want 1", calls)
	}
	if _, err := readDefinition(strings.NewReader(strings.Repeat("x", definitionSizeLimit+1))); err == nil {
		t.Fatal("accepted an oversized definition")
	}
}
