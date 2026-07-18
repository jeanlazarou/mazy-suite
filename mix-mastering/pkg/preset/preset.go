package preset

import (
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

//go:embed builtins/*.json
var builtinPresets embed.FS

// Preset represents a mastering preset.
type Preset struct {
	Name        string                        `json:"name"`
	Category    string                        `json:"category"` // genre, target, usecase
	Description string                        `json:"description"`
	Author      string                        `json:"author"`
	Tags        []string                      `json:"tags"`
	Processors  map[string]map[string]float64 `json:"processors"` // processor_name -> param -> value
}

// Manager manages loading, saving, and searching presets.
type Manager struct {
	presets   map[string]*Preset
	customDir string
}

// NewManager creates a preset manager.
func NewManager(customDir string) *Manager {
	m := &Manager{
		presets:   make(map[string]*Preset),
		customDir: customDir,
	}
	m.loadBuiltins()
	if customDir != "" {
		m.loadCustom()
	}
	return m
}

func (m *Manager) loadBuiltins() {
	entries, err := builtinPresets.ReadDir("builtins")
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := builtinPresets.ReadFile("builtins/" + entry.Name())
		if err != nil {
			continue
		}
		var p Preset
		if err := json.Unmarshal(data, &p); err != nil {
			continue
		}
		m.presets[strings.ToLower(p.Name)] = &p
	}
}

func (m *Manager) loadCustom() {
	if m.customDir == "" {
		return
	}
	filepath.Walk(m.customDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		var p Preset
		if err := json.Unmarshal(data, &p); err != nil {
			return nil
		}
		m.presets[strings.ToLower(p.Name)] = &p
		return nil
	})
}

// Get returns a preset by name (case-insensitive).
func (m *Manager) Get(name string) (*Preset, error) {
	p, ok := m.presets[strings.ToLower(name)]
	if !ok {
		return nil, fmt.Errorf("preset not found: %s", name)
	}
	return p, nil
}

// List returns all available presets.
func (m *Manager) List() []*Preset {
	var result []*Preset
	for _, p := range m.presets {
		result = append(result, p)
	}
	return result
}

// ListByCategory returns presets in a specific category.
func (m *Manager) ListByCategory(category string) []*Preset {
	var result []*Preset
	for _, p := range m.presets {
		if strings.EqualFold(p.Category, category) {
			result = append(result, p)
		}
	}
	return result
}

// Search finds presets matching a query string.
func (m *Manager) Search(query string) []*Preset {
	q := strings.ToLower(query)
	var result []*Preset
	for _, p := range m.presets {
		if strings.Contains(strings.ToLower(p.Name), q) ||
			strings.Contains(strings.ToLower(p.Description), q) ||
			containsTag(p.Tags, q) {
			result = append(result, p)
		}
	}
	return result
}

func containsTag(tags []string, query string) bool {
	for _, tag := range tags {
		if strings.Contains(strings.ToLower(tag), query) {
			return true
		}
	}
	return false
}

// Save saves a preset to the custom directory.
func (m *Manager) Save(p *Preset) error {
	if m.customDir == "" {
		return fmt.Errorf("no custom preset directory configured")
	}
	os.MkdirAll(m.customDir, 0755)

	filename := strings.ReplaceAll(strings.ToLower(p.Name), " ", "_") + ".json"
	path := filepath.Join(m.customDir, filename)

	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal preset: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write preset: %w", err)
	}

	m.presets[strings.ToLower(p.Name)] = p
	return nil
}

// ToJSON serializes a preset to JSON.
func (p *Preset) ToJSON() (string, error) {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// FromJSON deserializes a preset from JSON.
func FromJSON(data string) (*Preset, error) {
	var p Preset
	if err := json.Unmarshal([]byte(data), &p); err != nil {
		return nil, err
	}
	return &p, nil
}
