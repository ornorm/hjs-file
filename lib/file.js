/** @babel */
import {execFile, execFileSync} from "child_process";
import {
    access,
    accessSync,
    appendFile,
    appendFileSync,
    close,
    closeSync,
    chmod,
    chmodSync,
    constants,
    createReadStream,
    fdatasync,
    fdatasyncSync,
    fstat,
    fstatSync,
    fsync,
    fsyncSync,
    ftruncate,
    ftruncateSync,
    futimes,
    futimesSync,
    mkdir,
    mkdirSync,
    mkdtemp,
    mkdtempSync,
    open,
    openSync,
    read,
    readSync,
    readdir,
    readdirSync,
    readFile,
    readFileSync,
    realpath,
    realpathSync,
    rename,
    renameSync,
    rmdir,
    rmdirSync,
    statSync,
    stat,
    symlink,
    symlinkSync,
    truncate,
    truncateSync,
    unlink,
    unlinkSync,
    utimes,
    utimesSync,
    watch,
    unwatch,
    write,
    writeSync,
    writeFileSync
} from "fs";
import {basename, dirname, extname, isAbsolute, join, normalize, parse, resolve, sep} from "path";
import EventEmitter from "events";
import {homedir, tmpdir} from "os";
import * as util from 'hjs-core/lib/util';
import {ByteBuffer} from "hjs-io/lib/buffer";
import {InputStream} from "hjs-io/lib/input";

const IS_WIN = process.platform === 'win32';

export class FileInputStream extends InputStream {

    constructor({ path, parent = null }) {
        super();
        this.buf = null;
        this.file = new File({ path, parent });
        this.pos = this.count = this.markPos = 0;
    }

    available() {
        return this.count - this.pos;
    }

    ensureOpen() {
        if (this.buf === null) {
            throw new ReferenceError("Stream closed");
        }
    }

    close(onClose=null) {
        this.buf = null;
        this.pos = this.count = this.markPos = 0;
        if (onClose === null) {
            return this.file.close();
        } else {
            this.file.close((code, reason) => {
                onClose(code, reason);
            });
        }
    }

    mark(readAheadLimit) {
        this.markPos = this.pos;
    }

    markSupported() {
        return true;
    }

    open({ offset = 0, length = 0, blocking=true, onReadable }={}) {
        this.file.length((status, size) => {
            if (status === SUCCESS) {
                let start = 0;
                let end = size;
                this.file.getInputStream({
                    start,
                    end,
                    autoClose: false ,
                    onAccess: (code, stream) => {
                        if (code !== ERROR) {
                            if (blocking) {
                                stream.once('readable', () => {
                                    this.buf = ByteBuffer.createBuffer({capacity: size});
                                    const chunk = stream.read();
                                    let len = chunk.length;
                                    for (let i = 0; i < len; i++) {
                                        this.buf[i] = chunk.charCodeAt(i);
                                    }
                                    if (offset > 0 && length > 0) {
                                        this.pos = offset;
                                        this.count = Math.min(offset + length, size);
                                    } else {
                                        this.count = size;
                                        this.pos = 0;
                                    }
                                    onReadable();
                                });
                            } else {
                                const buf = [];
                                stream.on('error', (err) => {
                                    onReadable(err);
                                })
                                .on('data', (chunk) => {
                                    buf.push(chunk);
                                })
                                .on('end', () => {
                                    this.buf = ByteBuffer.createBuffer({ buffer: Buffer.concat(buf) });
                                    if (offset > 0 && length > 0) {
                                        this.pos = offset;
                                        this.count = Math.min(offset + length, size);
                                    } else {
                                        this.count = size;
                                        this.pos = 0;
                                    }
                                    onReadable();
                                });
                            }
                        } else {
                            onReadable(stream);
                        }
                    }
                });
            } else {
                onReadable(size);
            }
        });
    }

    read(b = null, off = 0, len = 0) {
        this.ensureOpen();
        if (b) {
            len = len || b.length;
            if (off < 0 || len < 0 || len > b.length - off) {
                throw new RangeError("IndexOutOfBoundsException");
            }
            if (this.pos >= this.count) {
                return -1;
            }
            if (this.pos + len > this.count) {
                len = this.count - this.pos;
            }
            if (len <= 0) {
                return 0;
            }
            util.arraycopy(this.buf, this.pos, b, off, len);
            this.pos += len;
            return len;
        }
        return (this.pos < this.count) ? (this.buf[this.pos++] & 0xff) : -1;
    }

    reset() {
        this.pos = this.markPos;
    }

    skip(n) {
        if (this.pos + n > this.count) {
            n = this.count - this.pos;
        }
        if (n < 0) {
            return 0;
        }
        this.pos += n;
        return n;
    }

}

/*
 S_IFMT     0170000   bitmask for the file type bitfields
 S_IFSOCK   0140000   socket
 S_IFLNK    0120000   symbolic link
 S_IFREG    0100000   regular file
 S_IFBLK    0060000   block device
 S_IFDIR    0040000   directory
 S_IFCHR    0020000   character device
 S_IFIFO    0010000   fifo
 S_ISUID    0004000   set UID bit
 S_ISGID    0002000   set GID bit (see below)
 S_ISVTX    0001000   sticky bit (see below)
 S_IRWXU      00700   mask for file owner permissions
 S_IRUSR      00400   owner has read permission
 S_IWUSR      00200   owner has write permission
 S_IXUSR      00100   owner has execute permission
 S_IRWXG      00070   mask for group permissions
 S_IRGRP      00040   group has read permission
 S_IWGRP      00020   group has write permission
 S_IXGRP      00010   group has execute permission
 S_IRWXO      00007   mask for permissions for others (not in group)
 S_IROTH      00004   others have read permission
 S_IWOTH      00002   others have write permisson
 S_IXOTH      00001   others have execute permissio
 */

export const READ = 'r';
export const READ_WRITE = 'r+';
export const READ_SYNC = 'rs';
export const READ_WRITE_SYNC = 'rs+';
export const WRITE = 'w';
export const WRITE_EXCLUSIVE = 'wx';
export const WRITE_CREATE = 'w+';
export const WRITE_CREATE_EXCLUSIVE = 'wx+';
export const APPEND = 'a';
export const APPEND_EXCLUSIVE = 'ax';
export const APPEND_READ = 'a+';
export const APPEND_READ_EXCLUSIVE = 'ax+';

export const SUCCESS = 0x1;
export const ERROR = 0x0;
export const FILE = 0x3;
export const DIR = 0x4;

const handleError = (ex=null, cb=null) => {
    if (cb !== null) {
        cb(ERROR, ex);
    }  else {
        EX = ex;
    }
};

const handleSuccess = (result=null, cb=null) => {
    if (cb === null) {
        return result;
    }
    cb(SUCCESS, result);
    return null;
};

export class FilenameFilter extends EventEmitter {

    constructor({ file, accept = null } = {}) {
        super();
        if (file === null) {
            throw new ReferenceError('FileNotFoundException');
        }
        this.file = file;
        if (accept !== null) {
            this.accept = accept;
        }
    }

    filter(sync=false) {
        if (!sync) {
            let result = this.file.list((dir, name) => { return this.accept(dir, name); });
            result === ERROR ?
                this.emit('filter', result, File.exception()) :
                this.emit('filter', SUCCESS, result);
        } else {
            this.file.list(
                (dir, name) => { return this.accept(dir, name); },
                (code, result) => { this.emit('filter', code, result); });
        }
    }

    filterFiles(sync=false) {
        if (!sync) {
            let result = this.file.listFiles((dir, name) => { return this.accept(dir, name); });
            result === ERROR ?
                this.emit('filter', result, File.exception()) :
                this.emit('filter', SUCCESS, result);
        } else {
            this.file.listFiles(
                (dir, name) => { return this.accept(dir, name); },
                (code, result) => { this.emit('filter', code, result); });
        }
    }

    accept(dir, name) {

    }

}

let EX = null;

export class File {

    constructor({ path, parent = null, onUnwatchDelete=false } = {}) {
        this.setup({ path, parent, onUnwatchDelete });
    }

    alias(dst, onAccess=null) {
        if (onAccess === null) {
            return File.linkSync({
                src: this.path,
                dst,
                sync: true
            });
        }
        File.linkSync({
            src: this.path,
            dst,
            onAccess
        });
    }

    static access({
        src=null,
        mode = constants.R_OK | constants.W_OK,
        onExists=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onExists);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    accessSync(src);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onExists);
                } finally {
                    return code;
                }
            } else {
                access(src, mode, (err) => {
                    err ? handleError(err, onExists) : handleSuccess(null, onExists);
                });
            }
        }
    }

    static appendFile ({
        src=null,
        data='',
        encoding = 'utf8',
        mode = 0o666,
        flag = 'a',
        onData=null,
        sync=false } = {}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onData);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    appendFileSync(src, data, { encoding, mode, flag });
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onData);
                } finally {
                    return code;
                }
            } else {
                appendFile(src, { encoding, mode, flag }, (err) => {
                    err ? handleError(err, onData) : handleSuccess(null, onData);
                });
            }
        }
    }

    canExecute(onAccess=null) {
        if (onAccess === null) {
            return File.access({
                src: this.path,
                mode: constants.X_OK,
                sync: true
            });
        }
        File.access({
            src: this.path,
            mode: constants.X_OK,
            onExists: onAccess
        });
    }

    canRead(onAccess=null) {
        if (onAccess === null) {
            return File.access({
                src: this.path,
                mode: constants.R_OK,
                sync: true
            });
        }
        File.access({
            src: this.path,
            mode: constants.R_OK,
            onExists: onAccess
        });
    }

    canWrite(onAccess=null) {
        if (onAccess === null) {
            return File.access({
                src: this.path,
                mode: constants.W_OK,
                sync: true
            });
        }
        File.access({
            src: this.path,
            mode: constants.W_OK,
            onExists: onAccess
        });
    }

    static chmod({ src=null, mode=0, onAccess=null, sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onAccess);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    chmodSync(src, mode);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onAccess);
                } finally {
                    return code;
                }
            } else {
                chmod(src, mode, (err) => { err ? handleError(err) : handleSuccess(null, onAccess); });
            }
        }
    }

    close(onClose=null) {
        if (onClose === null) {
            if (this.isOpen()) {
                let code = File.closeFd({
                    src: this.fd,
                    sync: true
                });
                this.fd = 0;
                if (code !== ERROR) {
                    return code;
                } else {
                    EX = EX || new ReferenceError('FileExistException');
                }
            } else {
                EX = new ReferenceError('FileNotOpenedException');
            }
            return ERROR;
        }
        if (this.isOpen()) {
            File.closeFd({
                src: this.fd,
                onClose: (code, reason) => {
                    this.fd = 0;
                    onClose(code, reason);
                }
            });
        } else  {
            onClose(ERROR, new ReferenceError('FileNotOpenedException'));
        }
    }

    static closeFd({ src=null, onClose=null, sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onClose);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    closeSync(src);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onClose);
                } finally {
                    return code;
                }
            } else {
                close(src, (err) => { err ? handleError(err) : handleSuccess(null, onClose); });
            }
        }
    }

    createDir(onAccess=null) {
        if (onAccess === null) {
            if (this.exists() === ERROR) {
                return File.mkdir({
                    src: this.path,
                    sync: true
                });
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.exists((code, reason) => {
            if (code === ERROR) {
                File.mkdir({
                    src: this.path,
                    onCreate: (code, reason) => { onAccess(code, reason); }
                });
            } else {
                onAccess(ERROR, reason || new ReferenceError('FileExistException'));
            }
        });
    }

    createDirs(onAccess=null) {
        if (onAccess === null) {
            let code = this.exists();
            if (code !== ERROR) {
                return File.mkdirs({
                    src: this.path,
                    sync: true
                });
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.exists((code, reason) => {
            if (code === ERROR) {
                File.mkdirs({
                    src: this.path,
                    onCreate: (code, reason) => { onAccess(code, reason); }
                });
            } else {
                onAccess(ERROR, reason || new ReferenceError('FileExistException'));
            }
        });
    }

    createDirTmp(onAccess=null, appendSep=false) {
        let src = !appendSep ? this.path : (this.path + sep);
        if (onAccess === null) {
            if (this.exists() === ERROR) {
                let folder = File.createTempDir({
                    src,
                    sync: true
                });
                if (folder !== ERROR) {
                    this.setup({ path: folder });
                }
                return folder;
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.exists((code, reason) => {
            if (code === ERROR) {
                File.createTempDir({
                    src,
                    onCreate: (code, reason) => {
                        if (code !== ERROR) {
                            this.setup({ path: reason });
                        }
                        onAccess(code, reason);
                    }
                });
            } else {
                onAccess(ERROR, reason || new ReferenceError('FileExistException'));
            }
        });
    }

    createFile(onAccess=null) {
        if (onAccess === null) {
            let code = this.exists();
            if (code === ERROR) {
                code = File.openFd({
                    src: this.path,
                    flags: 'wx+',
                    sync: true
                });
                if (code !== ERROR) {
                    return File.closeFd({
                        src: code,
                        sync: true
                    });
                } else {
                    EX = EX || new ReferenceError('FileExistException');
                }
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.exists((code, reason) => {
            if (code === ERROR) {
                File.openFd({
                    src: this.path,
                    flags: 'wx+',
                    onOpen: (code, fd) => {
                        if (code === SUCCESS) {
                            File.closeFd({
                                src: fd,
                                onClose: onAccess
                            });
                        } else {
                            onAccess(code, fd);
                        }
                    }
                });
            } else {
                onAccess(ERROR, reason || new ReferenceError('FileExistException'));
            }
        });
    }

    static createTempDir({
        prefix=null,
        options={ encoding:'utf8' },
        onAccess=null,
        sync=false
    }={}) {
        if (prefix === null) {
            handleError(new ReferenceError('PrefixNotFoundException'), onAccess);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    mkdtempSync(src, prefix, options);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onAccess);
                } finally {
                    return code;
                }
            } else {
                mkdtemp(src, prefix, { encoding }, (err) => { err ?
                    handleError(err) : handleSuccess(null, onAccess); });
            }
        }
    }

    static dataSync({ fd=null, onDataSync=null, sync=false }={}) {
        if (fd === null) {
            handleError(new ReferenceError('FdNotFoundException'), onDataSync);
        } else {
            if (sync) {
                try {
                    fdatasyncSync(fd);
                } catch (ex) {
                    handleError(ex, onDataSync);
                }
            } else {
                fdatasync(fd, (err) => { err ? handleError(err) : handleSuccess(null, onDataSync); });
            }
        }
    }

    deleteOnExit() {
        process.on('disconnect', () => {
            console.log('disconnect');
            if (this.isWatched() && this.onUnwatchDelete) {
                this.unwatch();
            } else {
                this.destroy();
            }
        });
        process.on('SIGTERM', () => {
            console.log('SIGTERM');
            if (this.isWatched() && this.onUnwatchDelete) {
                this.unwatch();
            } else {
                this.destroy();
            }
        });
    }

    deleteOnUnwatch(onUnwatchDelete=true) {
        this.onUnwatchDelete = onUnwatchDelete;
    }

    destroy() {
        this.exists((code, reason) => {
            if (code === SUCCESS) {
                this.isFile((code, reason) => {
                    if (code === SUCCESS) {
                        this.destroyFile((code, reason) => {
                            if (code === SUCCESS) {
                                console.log('file ' + this.getName() + ' destroyed.')
                            } else {
                                console.error(reason);
                            }
                        });
                    } else {
                        this.destroyDir((code, reason) => {
                            if (code === SUCCESS) {
                                console.log('directory ' + this.getName() + ' destroyed.')
                            } else {
                                console.error(reason);
                            }
                        });
                    }
                });
            } else {
                console.error(reason);
            }
        });
    }

    destroyDir(onAccess=null) {
        if (onAccess === null) {
            return File.rimraf({
                src: this.path,
                onExists: onAccess,
                sync: true
            });
        }
        File.rimraf({
            src: this.path,
            onRemove: onAccess
        });
    }

    destroyFile(onAccess=null) {
        if (onAccess === null) {
            return File.removeFileOrDir({
                src: this.path,
                mode: FILE,
                onExists: onAccess,
                sync: true
            });
        }
        File.removeFileOrDir({
            src: this.path,
            mode: FILE,
            onRemove: onAccess
        });
    }

    static exception() {
        return EX;
    }

    exec({ args=[], options={encoding: 'utf8'}, onAccess=null }) {
        if (onAccess === null) {
            let code = this.canExecute();
            if (code !== ERROR) {
                return File.execFile({
                    src: this.path,
                    args,
                    options,
                    sync: true
                });
            }
            return code;
        }
        this.canExecute((code, reason) => {
            if (code === SUCCESS) {
                File.execFile({
                    src: this.path,
                    args, options,
                    onAccess
                });
            } else {
                onAccess(code, reason);
            }
        });
    }

    static execFile({
        src=null,
        args=[],
        options={encoding: 'utf8'},
        onAccess=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onCreate);
        } else {
            if (sync) {
                let stdout;
                let code = SUCCESS;
                try {
                    stdout = execFileSync(src, args, options);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onAccess);
                } finally {
                    return code !== ERROR ? stdout : ERROR;
                }
            } else {
                execFile(src, args, options, (err, stdout, stderr) => {
                    if (err) {
                        handleError(err)
                    } else {
                        handleSuccess({ stdout, stderr }, onAccess);
                    }
                });
            }
        }
    }

    exists(onAccess=null) {
        if (onAccess === null) {
            return File.access({
                src: this.path,
                sync: true
            });
        }
        File.access({
            src: this.path,
            onExists: onAccess
        });
    }

    static futimes({ fd=null, atime=0, mtime=0, onFutimes=null, sync=false }={}) {
        if (fd === null) {
            handleError(new ReferenceError('FdNotFoundException'), onFutimes);
        } else {
            if (sync) {
                try {
                    futimesSync(fd, atime, mtime);
                } catch (ex) {
                    handleError(ex, onFutimes);
                }
            } else {
                futimes(fd, atime, mtime, (err) => { err ? handleError(err) : handleSuccess(null, onFutimes); });
            }
        }
    }

    getAbsoluteFile() {
        let path = this.getAbsolutePath();
        return new File({ path });
    }

    getAbsolutePath() {
        return resolve(this.path);
    }

    getCanonicalFile() {
        let path = this.getCanonicalPath();
        return new File({ path });
    }

    getCanonicalPath() {
        return IS_WIN ? this.path.replace(/\\/g, '/') : this.path;
    }

    getContent(onAccess=null) {
        if (onAccess === null) {
            let code = this.isFile();
            if (code !== ERROR) {
                return File.readFileOrDir({
                    src: this.path,
                    mode: FILE,
                    sync: true
                });
            }
            return code;
        }
        this.isFile((code, reason) => {
            if (code === SUCCESS) {
                File.readFileOrDir({
                    src: this.path,
                    mode: FILE,
                    onRead: onAccess
                });
            } else {
                onAccess(code, reason);
            }
        });
    }

    getExtension() {
        return extname(this.path);
    }

    getFd() {
        return this.fd;
    }

    static getHomeDir() {
        return new File({ path: homedir })
    }

    getInputStream({
        start=-1, end=-1, encoding='utf8', mode=0o666, autoClose=true, onAccess=null }={}) {
        if (autoClose) {
            if (onAccess === null) {
                let code = this.isFile();
                if (code !== ERROR) {
                    return start !== -1 && end !== -1 ?
                        createReadStream(this.path,
                            {start, end, flags: 'r', encoding, mode, autoClose}) :
                        createReadStream(this.path,
                            {flags: 'r', encoding, mode, autoClose});
                }
                return code;
            }
            this.isFile((code, reason) => {
                if (code === SUCCESS) {
                    onAccess(code, start !== -1 && end !== -1 ?
                        createReadStream(this.path,
                            {start, end, flags: 'r', encoding, mode, autoClose}) :
                        createReadStream(this.path,
                            {flags: 'r', encoding, mode, autoClose}));
                } else {
                    onAccess(code, reason);
                }
            });
        } else {
            if (onAccess === null) {
                let fd = this.open({ flags: 'r' });
                if (fd !== ERROR) {
                    return start !== -1 && end !== -1 ?
                        createReadStream(this.path,
                            {fd, start, end, flags: 'r', encoding, mode, autoClose}) :
                        createReadStream(this.path,
                            {fd, flags: 'r', encoding, mode, autoClose});
                }
                return fd;
            }
            this.open({
                flags: 'r',
                onOpen: (code, fd) => {
                    if (code === SUCCESS) {
                        onAccess(code, start !== -1 && end !== -1 ?
                            createReadStream(this.path,
                                {fd, start, end, flags: 'r', encoding, mode, autoClose}) :
                            createReadStream(this.path,
                                {fd, flags: 'r', encoding, mode, autoClose}));
                    } else {
                        onAccess(code, fd);
                    }
                }
            });
        }
    }

    getName() {
        return basename(this.path);
    }

    getOutputStream({ encoding='utf8', mode=0o666, autoClose=true, onAccess=null }={}) {
        if (onAccess === null) {
            let code = this.isFile();
            if (code !== ERROR) {
                return createReadStream({ flags: 'r', defaultEncoding : encoding, mode, autoClose });
            }
            return code;
        }
        this.isFile((code, reason) => {
            if (code === SUCCESS) {
                onAccess(code, createReadStream({ flags: 'r', defaultEncoding : encoding, mode, autoClose }));
            } else {
                onAccess(code, reason);
            }
        });
    }

    getParent() {
        return dirname(this.path);
    }

    getParentFile() {
        let p = this.getParent();
        if (p !== null) {
            return new File({ path: p });
        }
        return null;
    }

    getPath() {
        return this.path;
    }

    getRealPath(onAccess=null, encoding='utf8') {
        if (onAccess === null) {
            let resolvedPath = File.realpath({
                src: this.path,
                encoding,
                sync: true
            });
            return resolvedPath;
        }
        File.realpath({
            src: this.path,
            encoding,
            onAccess: (status, resolvedPath) => {
                status === SUCCESS ?
                    onAccess(SUCCESS, resolvedPath) : onAccess(status, resolvedPath);
            }
        });
    }

    static getTmpDir() {
        return new File({ path: tmpdir() })
    }

    isAbsolute() {
        return isAbsolute(this.path);
    }

    isDir(onAccess=null) {
        if (onAccess === null) {
            let stats = File.stat({
                src: this.path,
                sync: true
            });
            return stats !== ERROR ? stats.isDirectory() : stats;
        }
        File.stat({
            src: this.path,
            onStat: (status, stats) => {
                if (status === SUCCESS) {
                    stats.isDirectory() ?
                        onAccess(SUCCESS) :
                        onAccess(ERROR, new TypeError('NotDirectoryException'));
                } else {
                    onAccess(status, stats);
                }
            }
        });
    }

    isFile(onAccess=null) {
        if (onAccess === null) {
            let stats = File.stat({
                src: this.path,
                sync: true
            });
            return stats !== ERROR ? stats.isFile() : stats;
        }
        File.stat({
            src: this.path,
            onStat: (status, stats) => {
                if (status === SUCCESS) {
                    stats.isFile() ?
                        onAccess(SUCCESS) :
                        onAccess(ERROR, new TypeError('NotFileException'));
                } else {
                    onAccess(status, stats);
                }
            }
        });
    }

    isOpen() {
        return this.fd !== 0;
    }

    isRelative() {
        return !this.isAbsolute();
    }

    isWatched() {
        return this.watcher !== null;
    }

    static join(...paths) {
        return join.apply(null, paths);
    }

    lastModified(onAccess=null) {
        if (onAccess === null) {
            let stats = File.stat({
                src: this.path,
                sync: true
            });
            return stats !== ERROR ? Date.parse(stats.mtime) : stats;
        }
        File.stat({
            src: this.path,
            onStat: (code, stats) => {
                onAccess(code, code === SUCCESS ? Date.parse(stats.mtime) : stats);
            }
        });
    }

    length(onAccess=null) {
        if (onAccess === null) {
            let stats = File.stat({
                src: this.path,
                sync: true
            });
            return stats !== ERROR ? stats.size : stats;
        }
        File.stat({
            src: this.path,
            onStat: (code, stats) => { onAccess(code, code === SUCCESS ? stats.size : stats); }
        });
    }

    list(accept=null, onAccess=null) {
        if (onAccess === null) {
            let code = this.isDir();
            if (code !== ERROR) {
                let result = File.readFileOrDir({
                    src: this.path,
                    mode: DIR,
                    sync: true
                });
                if (result !== ERROR) {
                    return accept === null ?
                        result :
                        result.filter(fileName => { return accept(this, fileName); });
                }
                code = result;
            }
            return code;
        }
        this.isDir((code, reason) => {
            if (code === SUCCESS) {
                File.readFileOrDir({
                    src: this.path,
                    mode: DIR,
                    onRead: (code, reason) => {
                        if (code === SUCCESS) {
                            onAccess(
                                code,
                                accept === null ?
                                    reason :
                                    reason.filter(fileName => { return accept(this, fileName); })
                            );
                        } else {
                            onAccess(code, reason);
                        }
                    }
                });
            } else {
                onAccess(code, reason);
            }
        });
    }

    listFiles(accept=null, onAccess=null) {
        if (onAccess === null) {
            let code = this.isDir();
            if (code !== ERROR) {
                let result = File.readFileOrDir({
                    src: this.path,
                    mode: DIR,
                    sync: true
                });
                if (result !== ERROR) {
                    return (accept === null ?
                        result :
                        result.filter(fileName => { return accept(this, fileName); }))
                        .map((fileName) => { return new File({ path: fileName, parent: this }); });
                }
                code = result;
            }
            return code;
        }
        this.isDir((code, reason) => {
            if (code === SUCCESS) {
                File.readFileOrDir({
                    src: this.path,
                    mode: DIR,
                    onRead: (code, reason) => {
                        if (code === SUCCESS) {
                            onAccess(
                                code,
                                (accept === null ?
                                    reason :
                                    reason.filter(fileName => { return accept(this, fileName); }))
                                    .map((fileName) => { return new File({ path: fileName, parent: this }); })
                            );
                        } else {
                            onAccess(code, reason);
                        }
                    }
                });
            } else {
                onAccess(code, reason);
            }
        });
    }

    static mkdir({
        src=null,
        mode=0o777,
        onCreate=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onCreate);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    mkdirSync(src, mode);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onCreate);
                } finally {
                    return code;
                }
            } else {
                mkdir(src, mode, (err) => {
                    err ? handleError(err) : handleSuccess(null, onCreate);
                });
            }
        }
    }

    static mkdirs({
        src=null,
        mode=0o777,
        onCreate=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onCreate);
        } else {
            let queue = File.splitPaths(src);
            let len = queue.length;
            if (sync) {
                let code = SUCCESS;
                try {
                    if (len < 2) {
                        mkdirSync(queue[0], mode);
                    } else {
                        for (let i = 0; i < len; i++) {
                            let path = queue[i];
                            if (i === len - 1) {
                                mkdirSync(path, mode);
                            } else {
                                try {
                                    accessSync(path, constants.R_OK);
                                } catch (e) {
                                    mkdirSync(path, mode);
                                }
                            }
                        }
                    }
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onCreate);
                } finally {
                    return code;
                }
            } else {
                if (len < 2) {
                    mkdir(queue[0], mode, (err) => { err ? handleError(err) : handleSuccess(null, onCreate); });
                } else {
                    const next = () => {
                        let path = queue.shift();
                        if (path) {
                            if (queue.length === 0) {
                                mkdir(path, mode, (err) => {
                                    if (err) {
                                        handleError(err);
                                    } else {
                                        next();
                                    }
                                });
                            } else {
                                access(path, constants.R_OK, (err) => {
                                    if (!err) {
                                        next();
                                    } else {
                                        mkdir(path, mode, (err) => {
                                            if (err) {
                                                handleError(err);
                                            } else {
                                                next();
                                            }
                                        });
                                    }
                                });
                            }
                        } else {
                            handleSuccess(null, onCreate);
                        }
                    };
                    next();
                }
            }
        }
    }

    open({ flags='r+', onOpen=null }={}) {
        if (onOpen === null) {
            if (this.isFile()) {
                this.fd = File.openFd({
                    src: this.path,
                    flags,
                    sync: true
                });
                if (this.fd !== ERROR) {
                    return this.fd;
                } else {
                    EX = EX || new ReferenceError('FileExistException');
                }
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.isFile((code, reason) => {
            if (code !== ERROR) {
                File.openFd({
                    src: this.path,
                    flags,
                    onOpen: (code, fd) => {
                        if (code !== ERROR) {
                            onOpen(code, this.fd = fd);
                        } else {
                            onOpen(code, fd);
                        }
                    }
                });
            } else {
                onOpen(ERROR, reason || new ReferenceError('FileNotFoundException'));
            }
        });
    }

    static openFd({
        src=null,
        flags='r+',
        mode=0o666,
        onOpen=null,
        sync=false}={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onOpen);
        } else {
            if (sync) {
                let code = ERROR;
                try {
                    code = openSync(src, flags, mode);
                } catch (ex) {
                    console.log(ex);
                    handleError(ex, onOpen);
                } finally {
                    return code;
                }
            } else {
                open(src, flags, mode, (err, fd) => { err ? handleError(err) : handleSuccess(fd, onOpen); });
            }
        }
    }

    read({
        buffer=new Uint8Array(512, 0, 512),
        offset=0,
        length=0,
        position=0,
        onRead=null }={}) {
        if (onRead === null) {
            let code = this.isFile();
            if (code === ERROR) {
                code = File.openFd({
                    src: this.path,
                    sync: true
                });
                if (code !== ERROR) {
                    return File.readFd({
                        src: code,
                        buffer,
                        offset,
                        length,
                        position,
                        sync: true
                    });
                } else {
                    EX = EX || new ReferenceError('FileExistException');
                }
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.isFile((code, reason) => {
            if (code !== ERROR) {
                File.openFd({
                    src: this.path,
                    onOpen: (code, fd) => {
                        if (code === SUCCESS) {
                            File.readFd({
                                src: fd,
                                buffer,
                                offset,
                                length,
                                position,
                                onRead
                            });
                        } else {
                            onRead(code, fd);
                        }
                    }
                });
            } else {
                onRead(ERROR, reason || new ReferenceError('FileNotFoundException'));
            }
        });
    }

    static readFd({
        src=null,
        buffer=new Uint8Array(512, 0, 512),
        offset=0,
        length=0,
        position=0,
        onRead=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onRead);
        } else {
            if (length === 0) {
                length = buffer.length;
            }
            if (sync) {
                let data;
                let code = SUCCESS;
                try {
                    data = readSync(src, buffer, offset, length, position);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onRead);
                } finally {
                    return code !== ERROR ? data : ERROR;
                }
            } else {
                read(src, buffer, offset, length, position, (err, bytesRead, buffer) => {
                    err ? handleError(err, onRead) : handleSuccess([buffer, bytesRead], onRead);
                });
            }
        }
    }

    static readFileOrDir({
        src=null,
        mode=FILE,
        options={ encoding:'utf8' },
        onRead=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onRead);
        } else {
            if (sync) {
                let data;
                let code = SUCCESS;
                try {
                    data = mode === DIR ?
                        readdirSync(src, options) :
                        readFileSync(src, options);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onRead);
                } finally {
                    return code !== ERROR ? data : ERROR;
                }
            } else {
                switch (mode) {
                    case DIR:
                        readdir(src, options, (err, files) => { err ?
                            handleError(err, onRead) : handleSuccess(files, onRead); });
                        break;
                    default:
                        readFile(src, (err, data) => { err ?
                            handleError(err, onRead) : handleSuccess(data, onRead); });
                        break;
                }
            }
        }
    }

    static realpath({
        src=null,
        encoding='utf8',
        onAccess=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('PathNotFoundException'), onAccess);
        } else {
            if (sync) {
                let data;
                let code = SUCCESS;
                try {
                    data = realpathSync(src, { encoding });
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onAccess);
                } finally {
                    return code !== ERROR ? data : ERROR;
                }
            } else {
                realpath(src, { encoding }, (err, resolvedPath) => {
                    err ? handleError(err, onAccess) : handleSuccess(resolvedPath, onAccess);
                });
            }
        }
    }

    static removeFileOrDir({
        src=null,
        mode=FILE,
        onRemove=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onRemove);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    accessSync(src, constants.R_OK | constants.W_OK);
                    mode === DIR ?
                        rmdirSync(src) :
                        unlinkSync(src);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onRemove);
                } finally {
                    return code;
                }
            } else {
                access(src, constants.R_OK | constants.W_OK, (err) => {
                    if (err) {
                        handleError(err, onRemove);
                    } else {
                        switch (mode) {
                            case DIR:
                                rmdir(src, (err) => { err ?
                                    handleError(err, onRemove) : handleSuccess(null, onRemove); });
                                break;
                            default:
                                unlink(src, (err) => { err ?
                                    handleError(err, onRemove) : handleSuccess(null, onRemove); });
                                break;
                        }
                    }
                });
            }
        }
    }

    static rename({ src=null, dst=null, onRename=null, sync=false }={}) {
        if (src === null || dst === null) {
            handleError(new ReferenceError('FileNotFoundException'), onRename);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    renameSync(src, dst);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onRename);
                } finally {
                    return code;
                }
            } else {
                rename(src, dst, (err) => {
                    err ? handleError(err, onRename) : handleSuccess(null, onRename);
                });
            }
        }
    }

    renameTo(src, onAccess = null) {
        if (src instanceof File) {
            src = src.path;
        }
        if (onAccess === null) {
            return File.rename({
                src: this.path,
                dst: src,
                sync: true
            });
        }
        File.rename({
            src: this.path,
            dst: src,
            onRename: onAccess
        });
    }

    static rimraf({
        src=null,
        onRemove=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onRemove);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    let result = File.readFileOrDir({ src, mode: DIR, sync: true });
                    if (result !== ERROR) {
                        let queue = result.map(file => { return join(src, file); });
                        const next = () => {
                            let path = queue.shift();
                            if (path) {
                                let code = File.stat({ src: path, sync: true });
                                if (code !== ERROR) {
                                    if (code.isDirectory()) {
                                        code = File.rimraf({ src: path, sync: true });
                                        if (code !== ERROR) {
                                            code = next();
                                        }
                                    } else {
                                        code = File.removeFileOrDir({ src: path, mode: FILE, sync: true });
                                        if (code !== ERROR) {
                                            code = next();
                                        }
                                    }
                                }
                                return code;
                            } else {
                                return File.removeFileOrDir({ src: src, mode: DIR, sync: true });
                            }
                        };
                        result = next();
                    }
                    code = result;
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onRemove);
                } finally {
                    return code;
                }
            } else {
                File.readFileOrDir({
                    src,
                    mode: DIR,
                    onRead: (code, files) => {
                        if (code === SUCCESS) {
                            let queue = files.map(file => { return join(src, file); });
                            const next = () => {
                                let path = queue.shift();
                                if (path) {
                                    File.stat({
                                        src: path,
                                        onStat: (code, stats) => {
                                            if (code === ERROR) {
                                                handleError(stats, onRemove);
                                            } else {
                                                if (stats.isDirectory()) {
                                                    File.rimraf({
                                                        src: path,
                                                        onRemove: (code, reason) => {
                                                            code === SUCCESS ?
                                                                next() : handleError(reason, onRemove);
                                                        }
                                                    });
                                                } else {
                                                    File.removeFileOrDir({
                                                        src: path,
                                                        mode: FILE,
                                                        onRemove: (code, reason) => {
                                                            code === SUCCESS ?
                                                                next() : handleError(reason, onRemove);
                                                        }
                                                    });
                                                }
                                            }
                                        }
                                    });
                                } else {
                                    File.removeFileOrDir({
                                        src: src,
                                        mode: DIR,
                                        onRemove: (code, reason) => {
                                            code === SUCCESS ?
                                                handleSuccess(code, onRemove) : handleError(reason, onRemove);
                                        }
                                    });
                                }
                            };
                            queue.length === 0 ? handleSuccess(null, onRemove) : next();
                        } else {
                            handleError(null, onRemove);
                        }
                    }
                });
            }
        }
    }

    safeDestroy(mode = FILE, onAccess=null) {
        if (onAccess === null) {
            let code;
            switch(mode) {
                case FILE:
                    code = this.isFile();
                    if (code !== ERROR) {
                        return this.destroyFile();
                    } else {
                        EX = EX || new TypeError('NotFileException');
                    }
                    return ERROR;
                default:
                    code = this.isDir();
                    if (code !== ERROR) {
                        return this.destroyDir();
                    } else {
                        EX = EX || new TypeError('NotDirectoryException');
                    }
                    return ERROR;
            }
        }
        switch(mode) {
            case FILE:
                this.isFile((code, reason) => {
                    if (code === SUCCESS) {
                        this.destroyFile(onAccess);
                    } else {
                        onAccess(code, reason);
                    }
                });
                break;
            default:
                this.isDir((code, reason) => {
                    if (code === SUCCESS) {
                        this.destroyDir(onAccess);
                    } else {
                        onAccess(code, reason);
                    }
                });
                break;
        }
    }

    setContent({ buffer=new Uint8Array(512, 0, 512), onWrite=null }={}) {
        if (onWrite === null) {
            let code = this.isDir();
            if (code === ERROR) {
                return File.writeFile({
                    src: this.path,
                    buffer,
                    sync: true
                });
            } else {
                EX = EX || new ReferenceError('NotFileException');
            }
            return ERROR;
        }
        this.isDir((code, reason) => {
            if (code === ERROR) {
                File.writeFile({
                    src: this.path,
                    buffer,
                    onWrite
                });
            } else {
                onWrite(ERROR, new ReferenceError('NotFileException'));
            }
        });
    }

    setExecutable(executable=true, ownerOnly=true, onAccess=null) {
        let mode = 0;
        if (executable) {
            mode = ownerOnly ? 0o100 : 0o001;
        } else {
            mode = ownerOnly ? 0o600 : 0o006;
        }
        if (onAccess === null) {
            return File.chmod({
                src: this.path,
                mode,
                sync: true
            });
        }
        File.chmod({
            src: this.path,
            mode,
            onAccess
        });
    }

    setLastModified(mtime=(Date.now()/1000), onAccess=null) {
        if (onAccess === null) {
            return File.utimes({
                src: this.path,
                atime: mtime,
                mtime,
                sync: true
            });
        }
        File.utimes({
            src: this.path,
            atime: mtime,
            mtime,
            onAccess
        });
    }

    setReadable(readable=true, ownerOnly=true, onAccess=null) {
        let mode = 0;
        if (readable) {
            mode = ownerOnly ? 0o400 : 0o004;
        } else {
            mode = ownerOnly ? 0o200 : 0o002;
        }
        if (onAccess === null) {
            return File.chmod({
                src: this.path,
                mode,
                sync: true
            });
        }
        File.chmod({
            src: this.path,
            mode,
            onAccess
        });
    }

    setReadOnly(onAccess=null) {
        if (onAccess === null) {
            return File.chmod({
                src: this.path,
                mode: 0o666,
                sync: true
            });
        }
        File.chmod({
            src: this.path,
            mode: 0o666,
            onAccess
        });
    }

    setup({ path, parent = null, onUnwatchDelete=false } = {}) {
        if (path === null) {
            throw new ReferenceError('NullPointerException');
        }
        if (parent === null) {
            this.path = normalize(path);
        } else {
            if (parent instanceof File) {
                this.path = resolve(parent.path, normalize(path));
            } else {
                if (parent === '') {
                    this.path = resolve(process.pwd(), normalize(path));
                } else {
                    this.path = resolve(normalize(parent), normalize(path));
                }
            }
        }
        this.onUnwatchDelete = onUnwatchDelete;
        this.watcher = null;
        this.fd = 0;
    }

    setWritable(writable=true, ownerOnly=true, onAccess=null) {
        let mode = 0;
        if (writable) {
            mode = ownerOnly ? 0o200 : 0o002;
        } else {
            mode = ownerOnly ? 0o400 : 0o004;
        }
        if (onAccess === null) {
            return File.chmod({
                src: this.path,
                mode,
                sync: true
            });
        }
        File.chmod({
            src: this.path,
            mode,
            onAccess
        });
    }

    static slashify(path, isDir = false) {
        let p = path;
        if (sep !== '/') {
            p = p.replace(sep, '/');
        }
        if (p.indexOf('/') !== 0) {
            p = "/" + p;
        }
        if (p.charAt(p.length - 1) !== '/' && isDir) {
            p = p + "/";
        }
        return p;
    }

    static splitPaths(path) {
        let parts = path.split(sep);
        let len = parts.length;
        let list = [];
        for (let i = 1; i < len + 1; i++) {
            let path = join.apply(null, parts.slice(0, i));
            list.push(path);
        }
        return list;
    }

    static stat({ src=null, onStat=null, sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('StatNotFoundException'), onStat);
        } else {
            if (sync) {
                let stats;
                let code = SUCCESS;
                try {
                    stats = !isNaN(src) ? fstatSync(src) : statSync(src);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onStat);
                } finally {
                    return code !== ERROR ? stats : ERROR;
                }
            } else {
                if (!isNaN(src)) {
                    fstat(src, (err, stats) => { err ?
                        handleError(err, onStat) : handleSuccess(stats, onStat); });
                } else {
                    stat(src, (err, stats) => { err ?
                        handleError(err, onStat) : handleSuccess(stats, onStat); });
                }
            }
        }
    }

    static symlink({ src=null, dst=null, onAccess=null, sync=false }={}) {
        if (sync) {
            let code = SUCCESS;
            try {
                symlinkSync(src, dst);
            } catch (ex) {
                code = ERROR;
                handleError(ex, onAccess);
            } finally {
                return code;
            }
        } else {
            symlink(src, dst, (err) => { err ?
                handleError(err, onAccess) : handleSuccess(null, onAccess); });
        }
    }

    static sync({ fd=null, onSync=null, sync=false }={}) {
        if (fd === null) {
            handleError(new ReferenceError('FdNotFoundException'), onSync);
        } else {
            if (sync) {
                try {
                    fsyncSync(fd);
                } catch (ex) {
                    handleError(ex, onSync);
                }
            } else {
                fsync(fd, (err) => { err ? handleError(err) : handleSuccess(null, onSync); });
            }
        }
    }

    toObject() {
        return parse(this.path);
    }

    toString() {
        return `File(
            name=${this.getName()}, 
            path=${this.getPath()}, 
            parent=${this.getParent()}, 
            canon=${this.getCanonicalPath()})`
    }

    static truncate({ src=null, len = 0, onTruncate=null, sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onTruncate);
        } else {
            if (sync) {
                try {
                    if (!isNaN(src)) {
                        return ftruncateSync(src, len);
                    }
                    return truncateSync(src, len);
                } catch (ex) {
                    handleError(ex, onTruncate);
                }
            } else {
                if (!isNaN(src)) {
                    ftruncate(src, len, (err) => { err ?
                        handleError(err, onTruncate) : handleSuccess(null, onTruncate); });
                } else {
                    truncate(src, len, (err) => { err ?
                        handleError(err, onTruncate) : handleSuccess(null, onTruncate); });
                }
            }
        }
    }

    unwatch() {
        if (this.isWatched()) {
            console.log('starting unwatch ' + this.getName());
            this.watcher.close();
            this.watcher = null;
            if (this.onUnwatchDelete) {
                console.log('delete on unwatch ' + this.getName());
                this.destroy();
            }
        }
    }

    static utimes({ src=null, atime=0, mtime=0, onAccess=null, sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('FileNotFoundException'), onAccess);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    utimesSync(src, atime, mtime);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onAccess);
                } finally {
                    return code;
                }
            } else {
                utimes(src, atime, mtime, (err) => { err ?
                    handleError(err, onAccess) : handleSuccess(null, onAccess); });
            }
        }
    }

    watch({ persistent=false, recursive=false, encoding='utf8', onAccess }={}) {
        this.exists((code, reason) => {
            if (code !== ERROR) {
                console.log('starting watch ' + this.path);
                this.watcher = watch(this.path, {persistent, recursive, encoding}, (eventType, filename) => {
                    onAccess(eventType, filename);
                });
            } else {
                onAccess(ERROR, reason || new ReferenceError('FileNotFoundException'));
            }
        });
    }

    write({
        src=null,
        buffer=new Uint8Array(512, 0, 512),
        offset=0,
        length=0,
        position=0,
        encoding='utf8',
        onWrite=null }={}) {
        if (onWrite === null) {
            let code = this.isFile();
            if (code === ERROR) {
                code = File.openFd({
                    src: this.path,
                    sync: true
                });
                if (code !== ERROR) {
                    return File.writeFd({
                        src: code,
                        buffer,
                        offset,
                        length,
                        position,
                        encoding,
                        sync: true
                    });
                } else {
                    EX = EX || new ReferenceError('FileExistException');
                }
            } else {
                EX = EX || new ReferenceError('FileExistException');
            }
            return ERROR;
        }
        this.isFile((code, reason) => {
            if (code !== ERROR) {
                File.openFd({
                    src: this.path,
                    onOpen: (code, fd) => {
                        if (code === SUCCESS) {
                            File.writeFd({
                                src: fd,
                                buffer,
                                offset,
                                length,
                                position,
                                encoding,
                                onWrite
                            });
                        } else {
                            onWrite(code, fd);
                        }
                    }
                });
            } else {
                onWrite(ERROR, reason || new ReferenceError('FileNotFoundException'));
            }
        });
    }

    static writeFd({
        src=null,
        buffer=new Uint8Array(512, 0, 512),
        offset=0,
        length=0,
        position=0,
        encoding='utf8',
        onWrite=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onRead);
        } else {
            if (length === 0) {
                length = buffer.length;
            }
            let isString = typeof buffer === 'string';
            if (sync) {
                let data;
                let code = SUCCESS;
                try {
                    data = isString ?
                        writeSync(src, buffer, position, encoding) :
                        writeSync(src, buffer, offset, length, position);
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onWrite);
                } finally {
                    return code !== ERROR ? data : ERROR;
                }
            } else {
                if (isString) {
                    write(src, buffer, position, (err, written, string) => {
                        err ? handleError(err, onWrite) : handleSuccess([string, written], onWrite);
                    });
                } else {
                    write(src, buffer, offset, length, position, (err, bytesWritten, buffer) => {
                        err ? handleError(err, onWrite) : handleSuccess([buffer, bytesWritten], onWrite);
                    });
                }
            }
        }
    }

    static writeFile({
        src=null,
        buffer=new Uint8Array(512, 0, 512),
        encoding='utf8',
        mode=0o666,
        flag='w',
        onWrite=null,
        sync=false }={}) {
        if (src === null) {
            handleError(new ReferenceError('SourceNotFoundException'), onRead);
        } else {
            if (sync) {
                let code = SUCCESS;
                try {
                    writeFileSync(src, buffer, { encoding, mode, flag });
                } catch (ex) {
                    code = ERROR;
                    handleError(ex, onWrite);
                } finally {
                    return code;
                }
            } else {
                write(src, buffer, { encoding, mode, flag }, (err) => {
                    err ? handleError(err, onWrite) : handleSuccess(null, onWrite);
                });
            }
        }
    }

}
