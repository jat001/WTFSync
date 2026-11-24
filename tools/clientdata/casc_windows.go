package main

import (
	"crypto/md5"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	chinese       = 0x40
	byContentKey  = 0x01
	byFileID      = 0x03
	fillEncrypted = 0x20
	iconSizeLimit = 1 << 20
)

type casc struct {
	dll     *syscall.DLL
	storage uintptr
	root    string
}

type contentKey [md5.Size]byte

//go:uintptrescapes
func (c *casc) call(name string, args ...uintptr) error {
	proc, err := c.dll.FindProc(name)
	if err != nil {
		return err
	}
	ok, _, err := proc.Call(args...)
	if byte(ok) == 0 {
		return fmt.Errorf("%s: %w", name, err)
	}
	return nil
}

func openCasc(dllPath, root, product string) (*casc, error) {
	if !filepath.IsAbs(dllPath) {
		return nil, fmt.Errorf("CascLib path must be absolute")
	}
	dll, err := syscall.LoadDLL(dllPath)
	if err != nil {
		return nil, err
	}
	c := &casc{dll: dll, root: root}
	path, err := syscall.UTF16PtrFromString(root + "*" + product)
	if err == nil {
		err = c.call("CascOpenStorage", uintptr(unsafe.Pointer(path)), chinese, uintptr(unsafe.Pointer(&c.storage)))
		runtime.KeepAlive(path)
	}
	if err != nil {
		dll.Release()
		return nil, err
	}
	return c, nil
}

func (c *casc) close() {
	c.call("CascCloseStorage", c.storage)
	c.dll.Release()
}

func (c *casc) read(id uint32, limit uint64, flags uint32) ([]byte, error) {
	file, err := c.openFile(uintptr(id), byFileID|flags)
	if err != nil {
		return nil, err
	}
	defer c.call("CascCloseFile", file)
	return c.readFile(file, limit)
}

//go:uintptrescapes
func (c *casc) openFile(key uintptr, flags uint32) (uintptr, error) {
	var file uintptr
	err := c.call("CascOpenFile", c.storage, key, chinese, uintptr(flags), uintptr(unsafe.Pointer(&file)))
	return file, err
}

func (c *casc) readIcon(id uint32) ([]byte, contentKey) {
	file, err := c.openFile(uintptr(id), byFileID)
	if err != nil {
		return nil, contentKey{}
	}
	defer c.call("CascCloseFile", file)
	data, err := c.readFile(file, iconSizeLimit)
	if !errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) {
		return data, contentKey{}
	}
	var key contentKey
	const fileContentKeyInfo = 0 // CascFileContentKey
	if err := c.call("CascGetFileInfo", file, fileContentKeyInfo, uintptr(unsafe.Pointer(&key)), uintptr(len(key)), 0); err != nil {
		return nil, contentKey{}
	}
	return nil, key
}

func (c *casc) readIconByContentKey(key contentKey) []byte {
	file, err := c.openFile(uintptr(unsafe.Pointer(&key)), byContentKey)
	if err != nil {
		return nil
	}
	defer c.call("CascCloseFile", file)
	data, err := c.readFile(file, iconSizeLimit)
	if err != nil || md5.Sum(data) != key {
		return nil
	}
	return data
}

func (c *casc) readFile(file uintptr, limit uint64) ([]byte, error) {
	var size uint64
	if err := c.call("CascGetFileSize64", file, uintptr(unsafe.Pointer(&size))); err != nil {
		return nil, err
	}
	if size == 0 || size > limit {
		return nil, fmt.Errorf("unexpected file size: %d", size)
	}
	data := make([]byte, int(size))
	for offset := 0; offset < len(data); {
		length := min(256*1024, len(data)-offset)
		var count uint32
		if err := c.call("CascReadFile", file, uintptr(unsafe.Pointer(&data[offset])), uintptr(length), uintptr(unsafe.Pointer(&count))); err != nil {
			return nil, err
		}
		if count == 0 || int(count) > length {
			return nil, fmt.Errorf("invalid read length: %d", count)
		}
		offset += int(count)
	}
	return data, nil
}
