import chalk, {ColorName, ModifierName} from 'chalk';
import {Logger} from '../Logger.js';

export class ReportTags {
    tags: Map<string, string> = new Map();

    addTag(groupName: string, value: string) {
        this.tags.set(groupName, value);
    }

    getTags() {
        return this.tags;
    }
}

type LogOptions = {
    indent?: number,
    prefix?: string,
    prefixStyle?: (ModifierName|ColorName)[]
    style?: (ModifierName|ColorName)[]
};
type ReportingCategoryOptions = {skipTitle?: boolean, skipCount?: boolean, title?: string, logOptions?: LogOptions, titleLogOptions?: LogOptions, indentChildren?: boolean}

export class ReportingCategory {
    name: string;
    options: ReportingCategoryOptions;

    constructor(name: string, options: ReportingCategoryOptions = {}) {
        this.name = name;
        this.options = options;
    }
}

/**
 * The reporter collects information about exactly what the importers did (or will be doing in case of dry runs).
 * The structure is as follows:
 *
 */
export class Reporter {
    category: ReportingCategory;

    constructor(category: ReportingCategory) {
        this.category = category;
    }

    children: Map<ReportingCategory, Reporter> = new Map();

    totalCount: number = 0;
    tagCounts: Map<string, Map<string, number>> = new Map();

    addChildReporter(reporter: Reporter) {
        if (this.children.has(reporter.category)) {
            throw new Error('Reporter already has a child reporter for ' + reporter.category.name);
        }
        this.children.set(reporter.category, reporter);
    }

    report(categories: ReportingCategory[], tags: ReportTags) {
        this.totalCount += 1;

        const currentTags = tags.getTags();
        for (const [groupName, value] of currentTags) {
            const group = this.tagCounts.get(groupName) ?? new Map();
            this.tagCounts.set(groupName, group);
            group.set(value, (group.get(value) ?? 0) + 1);
        }

        if (categories.length === 0) {
            return;
        }
        const category = categories.shift();
        if (category) {
            const child = this.children.get(category) ?? new Reporter(category);
            this.children.set(category, child);
            child.report(categories, tags);
        }
    }

    private style(str: string, style?: (ModifierName|ColorName)[]): string {
        if (!style || style.length === 0) {
            return str;
        }
        return this.style(chalk[style[0]](str), style.slice(1));
    }

    private log(str: string, options: LogOptions) {
        // eslint-disable-next-line no-console
        Logger.shared.plain('    '.repeat(options.indent ?? 0) + this.style(options.prefix ?? '', options?.prefixStyle) + this.style(str, options.style));
    }

    print(options: LogOptions) {
        if (this.children.size > 0) {
            let first = true;
            for (const [category, reporter] of this.children) {
                if (!first) {
                    Logger.shared.newline();
                }
                first = false;

                if (category.options.skipTitle) {
                    reporter.print({
                        ...category.options.logOptions,
                        ...options
                    });
                } else {
                    if (!category.options.skipCount) {
                        this.log(`${reporter.totalCount === this.totalCount ? 'All' : reporter.totalCount} ${category.options.title ?? category.name}${reporter.totalCount === this.totalCount ? ' (' + reporter.totalCount + ')' : ''}`, {
                            ...category.options.titleLogOptions,
                            ...options
                        });
                    } else {
                        this.log(`${category.options.title ?? category.name}`, {
                            ...category.options.titleLogOptions,
                            ...options
                        });
                    }
                    reporter.print({
                        ...category.options.logOptions,
                        ...options,
                        indent: (options?.indent ?? 0) + ((category.options.indentChildren ?? true) ? 1 : 0)
                    });
                }
            }
            return;
        }

        for (const [groupName, group] of this.tagCounts) {
            if (group.size === 1) {
                const value = [...group.keys()][0];
                const count = [...group.values()][0];
                if (count === this.totalCount) {
                    this.log(`${groupName}: ${chalk.dim(value)}`, options);
                } else {
                    this.log(`${groupName}: ${chalk.dim(value)} (${count}/${this.totalCount})`, options);
                }
                continue;
            }

            this.log(`By ${groupName}:`, options);
            let tracked = 0;

            for (const [value, count] of group) {
                tracked += count;
                this.log(`- ${value}: ${count}`, {
                    ...options,
                    indent: (options?.indent ?? 0) + 1,
                    style: ['dim']
                });
            }

            if (this.totalCount > tracked) {
                this.log(`- (others): ${this.totalCount - tracked}`, {
                    ...options,
                    indent: (options?.indent ?? 0) + 1,
                    style: ['dim']
                });
            }

            if (this.totalCount < tracked) {
                this.log(`- (too many tracked - this is not good and needs fixing): ${tracked - this.totalCount}`, {
                    ...options,
                    indent: (options?.indent ?? 0) + 1,
                    style: ['dim']
                });
            }
        }
    }
}
