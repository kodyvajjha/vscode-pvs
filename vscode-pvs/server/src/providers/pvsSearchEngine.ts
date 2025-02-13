/**
 * @module PvsSearchEngine
 * @author Paolo Masci
 * @date 2021.02.01
 * @copyright 
 * Copyright 2019 United States Government as represented by the Administrator 
 * of the National Aeronautics and Space Administration. All Rights Reserved.
 *
 * Disclaimers
 *
 * No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY
 * WARRANTY OF ANY KIND, EITHER EXPRESSED, IMPLIED, OR STATUTORY,
 * INCLUDING, BUT NOT LIMITED TO, ANY WARRANTY THAT THE SUBJECT SOFTWARE
 * WILL CONFORM TO SPECIFICATIONS, ANY IMPLIED WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR FREEDOM FROM
 * INFRINGEMENT, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE ERROR
 * FREE, OR ANY WARRANTY THAT DOCUMENTATION, IF PROVIDED, WILL CONFORM TO
 * THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, IN ANY MANNER,
 * CONSTITUTE AN ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT
 * OF ANY RESULTS, RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY
 * OTHER APPLICATIONS RESULTING FROM USE OF THE SUBJECT SOFTWARE.
 * FURTHER, GOVERNMENT AGENCY DISCLAIMS ALL WARRANTIES AND LIABILITIES
 * REGARDING THIRD-PARTY SOFTWARE, IF PRESENT IN THE ORIGINAL SOFTWARE,
 * AND DISTRIBUTES IT "AS IS."
 *
 * Waiver and Indemnity: RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS
 * AGAINST THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND
 * SUBCONTRACTORS, AS WELL AS ANY PRIOR RECIPIENT.  IF RECIPIENT'S USE OF
 * THE SUBJECT SOFTWARE RESULTS IN ANY LIABILITIES, DEMANDS, DAMAGES,
 * EXPENSES OR LOSSES ARISING FROM SUCH USE, INCLUDING ANY DAMAGES FROM
 * PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S USE OF THE SUBJECT
 * SOFTWARE, RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE UNITED
 * STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY
 * PRIOR RECIPIENT, TO THE EXTENT PERMITTED BY LAW.  RECIPIENT'S SOLE
 * REMEDY FOR ANY SUCH MATTER SHALL BE THE IMMEDIATE, UNILATERAL
 * TERMINATION OF THIS AGREEMENT.
 **/

import { execSync } from "child_process";
import { Connection } from "vscode-languageserver";
import { PvsLanguageServer } from "../pvsLanguageServer";
import { SearchResult } from "../common/serverInterface";
import * as fsUtils from "../common/fsUtils";
import * as path from 'path';
import * as colorUtils from '../common/colorUtils';

export class PvsSearchEngine {
    protected connection: Connection;
    protected pvsLanguageServer: PvsLanguageServer;

    constructor (connection: Connection, pvsLanguageServer: PvsLanguageServer) {
        this.connection = connection;
        this.pvsLanguageServer = pvsLanguageServer;
    }
    
    async searchNasalib (searchString: string): Promise<SearchResult[]> {
		if (searchString) {
			const nasalibPath: string = this.pvsLanguageServer.getNasalibPath();
			const normalizedSearchString: string = searchString.replace(/\|/g, "\\|");
			const findAll: string = `cd ${nasalibPath} && ./find-all "${normalizedSearchString}"`;
			console.log(`[pvs-search-engine] ${findAll}`);
			process.env["PVS_DIR"] = this.pvsLanguageServer.getPvsPath();
			process.env["PVS_LIBRARY_PATH"] = nasalibPath;
			const search: Buffer = execSync(findAll);
			if (search) {
				const res: SearchResult[] = [];
				const ans: string = search.toLocaleString();
				if (colorUtils.isPlainText(ans)) {
					// old nasalib scripts
					const txt: string = ans;
					const matchContent: RegExpMatchArray = /\*\*\*[\w\W\n]+/g.exec(txt);
					if (matchContent) {
						const elems: string[] = matchContent[0].split("***");
						for (let i = 0; i < elems.length; i++) {
							const subfolderInfo: string[] = elems[i].trim().split("\n");
							if (subfolderInfo && subfolderInfo.length > 1) {
								const subfolder: string = subfolderInfo[0].trim();
								for (let j = 1; j < subfolderInfo.length; j++) {
									const data: string = subfolderInfo[j];
									const sep: number = data.indexOf(":");
									const fname: string = data.substring(0, sep);
									let content: string = data.substring(sep + 1);
									let line: number = 1;
									// group 1 is line number, group 2 is content
									const matchLine: RegExpMatchArray = /\s*(\d+)\:([\w\W\s]+)/g.exec(content);
									if (matchLine && matchLine.length > 2) {
										content = matchLine[2];
										line = +matchLine[1];
									}
									const searchResult: SearchResult = {
										fileName: fsUtils.getFileName(fname),
										fileExtension: fsUtils.getFileExtension(fname),
										contextFolder: path.join(nasalibPath, subfolder),
										fileContent: content,
										line
									};
									res.push(searchResult);
								}
							}
						}
					}
				} else {
					// new nasalib scripts
					let txt: string = colorUtils.getPlainText(ans);
					txt = txt.replace(/.*\s+Finding\.\.\.\s*\[NOT FOUND\]\s/g, ""); // remove not found
					const regex: RegExp = new RegExp(/.*\s+Finding\.\.\.\s*\[FOUND\]\s/g);
					const boundaries: { from: number, to: number }[] = [];
					let matchContent: RegExpMatchArray = null;
					while (matchContent = regex.exec(txt)) {
						if (matchContent.length && matchContent[0]) {
							boundaries.push({
								from: boundaries.length ? boundaries[boundaries.length - 1].to : 0,
								to: matchContent.index
							});
						}
					}
					// add also last fragment, from FOUND to the end of the text
					boundaries.push({
						from: boundaries.length ? boundaries[boundaries.length - 1].to : 0,
						to: txt.length
					});
					for (let i = 0; i < boundaries.length; i++) {
						const info: string = txt.substring(boundaries[i].from, boundaries[i].to);
						const match: RegExpMatchArray = /(.*)\s+Finding\.\.\.\s*\[FOUND\]\s([\w\W\s]+)/g.exec(info);
						if (match && match.length > 2 && match[1] && match[2]) {
							const subfolder: string = match[1].trim();
							const data: string = match[2].trim();

							const lines: string[] = data.split("\n");
							for (let l in lines) {
								const sep: number = lines[l].indexOf(":");
								const fname: string = lines[l].substring(0, sep);
								let content: string = lines[l].substring(sep + 1);

								let line: number = 1;
								// group 1 is line number, group 2 is content
								const matchLine: RegExpMatchArray = /\s*(\d+)\:([\w\W\s]+)/g.exec(content);
								if (matchLine && matchLine.length > 2) {
									content = matchLine[2];
									line = +matchLine[1];
								}
								// sanity check
								if (content && line && fsUtils.fileExists(path.join(nasalibPath, subfolder, fname))) {
									const searchResult: SearchResult = {
										fileName: fsUtils.getFileName(fname),
										fileExtension: fsUtils.getFileExtension(fname),
										contextFolder: path.join(nasalibPath, subfolder),
										fileContent: content,
										line
									};
									res.push(searchResult);
								}
							}
						}
					}
				}

				// console.log(res);
				return res;
			}
		}
		return null;
	}
 }