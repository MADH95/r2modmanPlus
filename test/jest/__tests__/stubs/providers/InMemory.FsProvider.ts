import FsProvider from '../../../../../src/providers/generic/file/FsProvider';
import StatInterface from '../../../../../src/providers/generic/file/StatInterface';
import * as path from 'path';

type FileType = {name: string, type: "FILE" | "DIR", nodes: FileType[] | undefined, content: string | undefined};


/**
 * (Poor) dummy implementation of the node FS library intended to be used for realistic tests.
 * Saves files from having to be written to disk during testing.
 */
export default class InMemoryFsProvider extends FsProvider {

    private static files: FileType[] = [];

    public static clear() {
        InMemoryFsProvider.files = [];
    }

    private findFileType(typePath: string, type?: "FILE" | "DIR"): FileType {
        let root = InMemoryFsProvider.files;
        let found: FileType | undefined;
        typePath.split(path.sep).forEach(value => {
            if (found === undefined) {
                found = root.find(value1 => value1.name === value)!;
            } else {
                found = (found.nodes || []).find(value1 => value1.name === value)!;
            }
        })
        if (type !== undefined && found!.type !== type) {
            throw new Error("Types not matching");
        }
        if (found === undefined) {
            throw new Error("File type not found");
        }
        return found!;
    }

    private deepCopyDirFileType(typePath: string): FileType {
        const found = this.findFileType(typePath);
        const nodes: FileType[] = [];
        (found.nodes || []).forEach(value => {
            try {
                nodes.push(this.deepCopyDirFileType(path.join(typePath, value.name)));
            } catch (e) {
                // Do nothing, end of tree.
            }
        });
        return {
            type: found.type,
            content: found.content,
            name: found.name,
            nodes: nodes
        } as FileType
    }

    async base64FromZip(path: string): Promise<string> {
        return Promise.resolve('');
    }

    async chmod(path: string, mode: string | number): Promise<void> {
        return Promise.resolve();
    }

    async copyFile(from: string, to: string): Promise<void> {
        const source = this.findFileType(from, "FILE");
        const dest = this.findFileType(path.dirname(to), "DIR");
        const newNodes = (dest.nodes || []).filter(value => value.name !== path.basename(to));
        newNodes.push({
            name: path.basename(to),
            type: "FILE",
            content: source.content
        } as FileType);
        dest.nodes = newNodes;
    }

    async copyFolder(from: string, to: string): Promise<void> {
        const dest = this.findFileType(path.dirname(to), "DIR");
        const newNodes = (dest.nodes || []).filter(value => value.name !== path.basename(to));
        const clonedFrom = this.deepCopyDirFileType(from);
        clonedFrom.name = path.basename(to);
        newNodes.push(clonedFrom);
        dest.nodes = newNodes;
    }

    async exists(path: string): Promise<boolean> {
        try {
            this.findFileType(path);
            return true;
        } catch (e) {
            return false;
        }
    }

    async lstat(path: string): Promise<StatInterface> {
        const found = this.findFileType(path);
        const res: StatInterface = {
            isDirectory: () => found.type === "DIR",
            isFile: () => found.type === "FILE",
            mtime: new Date()
        };
        return Promise.resolve(res);
    }

    async mkdirs(dirPath: string): Promise<void> {
        let root = InMemoryFsProvider.files;
        dirPath.split(path.sep).forEach(step => {
            const found = root.find(value => value.name === step);
            if (found === undefined) {
                const dir: FileType = {
                    name: step,
                    type: "DIR",
                    nodes: [],
                    content: undefined
                }
                root.push(dir);
                root = dir.nodes!;
            } else {
                root = found.nodes!;
            }
        });
    }

    async readFile(path: string): Promise<Buffer> {
        try {
            return Buffer.from(this.findFileType(path, "FILE").content!);
        } catch (e) {
            console.log(JSON.stringify(InMemoryFsProvider.files));
            throw e;
        }
    }

    async readdir(path: string): Promise<string[]> {
        const dir = this.findFileType(path, "DIR");
        return (dir.nodes || []).map(value => value.name);
    }

    async realpath(path: string): Promise<string> {
        return Promise.resolve(path);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        const copyOf = this.deepCopyDirFileType(oldPath);
        const parent = this.findFileType(path.dirname(oldPath), "DIR");
        const newParent = this.findFileType(path.dirname(newPath), "DIR");
        parent.nodes = (parent.nodes || []).filter(value => value.name !== copyOf.name);
        newParent.nodes = (newParent.nodes || []);
        newParent.nodes.push(copyOf);
    }

    async rmdir(dir: string): Promise<void> {
        const found = this.findFileType(path.dirname(dir), "DIR");
        const parent = this.findFileType(path.dirname(dir), "DIR");
        if ((found.nodes || []).length > 0) {
            throw new Error("Directory is not empty");
        }
        parent.nodes = (parent.nodes || []).filter(value => value.name !== found.name);
    }

    async stat(path: string): Promise<StatInterface> {
        return this.lstat(path);
    }

    async unlink(file: string): Promise<void> {
        const found = this.findFileType(path.dirname(file), "FILE");
        const parent = this.findFileType(path.dirname(file), "DIR");
        parent.nodes = (parent.nodes || []).filter(value => value.name !== found.name);
    }

    async writeFile(file: string, content: string | Buffer): Promise<void> {
        const newFile: FileType = {
            name: path.basename(file),
            nodes: undefined,
            content: content instanceof Buffer ? content.toString() : content,
            type: "FILE"
        }
        const parent = this.findFileType(path.dirname(file), "DIR");
        parent.nodes = (parent.nodes || []).filter(value => value.name !== newFile.name);
        parent.nodes.push(newFile);
    }

}
