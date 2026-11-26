package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"time"

	"github.com/wowsims/forever/tools/db2tool/dbd"
)

const (
	definitionURL       = "https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/definitions/"
	definitionSizeLimit = 256 << 10
)

type schemaStore struct {
	cacheDir  string
	fetch     func(context.Context, string) ([]byte, error)
	attempted map[string]bool
	deadline  context.Context
	cancel    context.CancelFunc
}

type tableSchema struct {
	definition dbd.DBDefinition
	layout     dbd.VersionDefinitions
	downloaded []byte
}

func parseSchema(data []byte, hash string, build uint32) (tableSchema, error) {
	definition, err := dbd.Read(bytes.NewReader(data), true)
	if err != nil {
		return tableSchema{}, err
	}
	exact, err := dbd.SelectVersion(definition, build)
	if err == nil && slices.Contains(exact.LayoutHashes, hash) {
		return tableSchema{definition: definition, layout: exact}, nil
	}
	for _, layout := range definition.VersionDefinitions {
		if slices.Contains(layout.LayoutHashes, hash) {
			return tableSchema{definition: definition, layout: layout}, nil
		}
	}
	return tableSchema{}, fmt.Errorf("unknown DB2 layout %s for build %d", hash, build)
}

func (s *schemaStore) resolve(name, hash string, build uint32) (tableSchema, error) {
	filename := name + ".dbd"
	// The embedded file list also limits the names eligible for cache and HTTP access.
	source, err := definitions.ReadFile("definitions/definitions/" + filename)
	if err != nil {
		return tableSchema{}, err
	}
	schema, localErr := parseSchema(source, hash, build)
	if localErr == nil || s.cacheDir == "" {
		return schema, localErr
	}
	if cached, err := os.Open(filepath.Join(s.cacheDir, filename)); err == nil {
		data, readErr := readDefinition(cached)
		cached.Close()
		if readErr == nil {
			if schema, err := parseSchema(data, hash, build); err == nil {
				return schema, nil
			}
		}
	}
	if s.deadline == nil {
		// Bound all definition requests made by this sidecar invocation.
		s.deadline, s.cancel = context.WithTimeout(context.Background(), 5*time.Second)
		s.attempted = make(map[string]bool)
	}
	if s.attempted[name] || s.deadline.Err() != nil {
		return tableSchema{}, localErr
	}
	s.attempted[name] = true
	fetch := s.fetch
	if fetch == nil {
		fetch = downloadDefinition
	}
	data, err := fetch(s.deadline, filename)
	if err != nil {
		return tableSchema{}, fmt.Errorf("%w; definition update: %v", localErr, err)
	}
	schema, err = parseSchema(data, hash, build)
	if err != nil {
		return tableSchema{}, fmt.Errorf("updated definition: %w", err)
	}
	schema.downloaded = data
	return schema, nil
}

func (s *schemaStore) close() {
	if s.cancel != nil {
		s.cancel()
	}
}

func (s *schemaStore) save(name string, data []byte) {
	if err := os.MkdirAll(s.cacheDir, 0700); err != nil {
		return
	}
	temp, err := os.CreateTemp(s.cacheDir, ".dbd-*")
	if err != nil {
		return
	}
	defer os.Remove(temp.Name())
	_, writeErr := temp.Write(data)
	closeErr := temp.Close()
	if writeErr == nil && closeErr == nil {
		// Replace the previous definition only after the new file is complete.
		_ = os.Rename(temp.Name(), filepath.Join(s.cacheDir, name+".dbd"))
	}
}

func readDefinition(reader io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, definitionSizeLimit+1))
	if err == nil && len(data) > definitionSizeLimit {
		err = fmt.Errorf("DBD definition exceeds %d bytes", definitionSizeLimit)
	}
	return data, err
}

func downloadDefinition(ctx context.Context, filename string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, definitionURL+filename, nil)
	if err != nil {
		return nil, err
	}
	client := http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	return readDefinition(response.Body)
}
