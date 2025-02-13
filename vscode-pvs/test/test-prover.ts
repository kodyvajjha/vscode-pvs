import * as fsUtils from "../server/src/common/fsUtils";
import * as test from "./test-constants";
import { PvsResponse, PvsResult } from "../server/src/common/pvs-gui";
import { PvsProxy } from '../server/src/pvsProxy'; // XmlRpcSystemMethods
import { configFile, sandboxExamples, safeSandboxExamples, radixExamples, helloworldExamples } from './test-utils';
import { PvsFormula, PvsProofCommand } from "../server/src/common/serverInterface";
import * as path from 'path';
import { execSync } from "child_process";
import { expect } from 'chai';

//----------------------------
//   Test cases for prover --- 	THESE TESTS REQUIRE PVS RUNNING IN SERVER MODE ON PORT 22334 + NASALIB
//----------------------------
describe("pvs-prover", () => {
	let pvsProxy: PvsProxy = null;
	before(async () => {
		const config: string = await fsUtils.readFile(configFile);
		const content: { pvsPath: string } = JSON.parse(config);
		// log(content);
		const pvsPath: string = content.pvsPath;
		// log("Activating xmlrpc proxy...");
		pvsProxy = new PvsProxy(pvsPath, { externalServer: true });
		await pvsProxy.activate({ debugMode: false, showBanner: false }); // this will also start pvs-server

		// delete pvsbin files and .pvscontext
		await fsUtils.cleanBin(safeSandboxExamples);
		await fsUtils.cleanBin(sandboxExamples);
		await fsUtils.cleanBin(radixExamples);

		console.log("\n----------------------");
		console.log("test-prover");
		console.log("----------------------");
	});
	after(async () => {
		await pvsProxy.killPvsServer();
		await pvsProxy.killPvsProxy();
		// delete pvsbin files and .pvscontext
		await fsUtils.cleanBin(safeSandboxExamples);
		await fsUtils.cleanBin(sandboxExamples);
		await fsUtils.cleanBin(radixExamples);
	});

	// utility function, quits the prover if the prover status is active
	const quitProverIfActive = async (): Promise<void> => {
		let proverStatus: PvsResult = await pvsProxy.pvsRequest('prover-status'); // await pvsProxy.getProverStatus();		
		// console.dir(proverStatus);
		if (proverStatus && proverStatus.result !== "inactive") {
			await pvsProxy.proofCommand({ cmd: 'quit' });
		}

		// // quit prover if prover status is active
		// const proverStatus: PvsResult = await pvsProxy.getProverStatus();
		// expect(proverStatus.result).not.to.be.undefined;
		// expect(proverStatus.error).to.be.undefined;
		// // console.log(proverStatus);
		// if (proverStatus && proverStatus.result !== "inactive") {
		// 	await pvsProxy.proofCommand({ cmd: 'quit' });
		// }
	}

	// @Sam: this first test fails intermittently.
	//       It seems that pvs returns a response before it's ready to accept a proof command (if a delay is introduced before sending the command request then the test succeeds)
	//       There is also a problem with the prover status: sometimes pvs returns the following error:
	//            'Value #<unknown object of type number 3 @\n' +
	//            '        #x107000000100223> is not of a type which can be encoded by encode-json.'
	//       This error usually occurs when the server is restarted, during the first prover session  
	it(`can start a proof and step proof commands`, async () => { // to run all tests, change fit(...) into it(...)
		const proverStatus: PvsResult = await pvsProxy.pvsRequest('prover-status'); // await pvsProxy.getProverStatus();
		expect(proverStatus.result).not.to.be.undefined;
		expect(proverStatus.error).to.be.undefined;
		// console.log(proverStatus);
		
		if (proverStatus && proverStatus.result !== "inactive") {
			await pvsProxy.proofCommand({ cmd: 'quit' });
		}
		const baseFolder: string = path.join(__dirname, "proof-explorer");
		const request: PvsProofCommand = {
			contextFolder: path.join(baseFolder, "foo"),
			fileExtension: '.pvs',
			fileName: 'foo',
			formulaName: 'foo1',
			theoryName: 'foo_th',
			cmd: "(skosimp*)"
		};
		
		let response: PvsResponse = await pvsProxy.proveFormula(request);
		// console.dir(response, { depth: null });
		
		expect(response.result).not.to.be.undefined;
		expect(response.error).to.be.undefined;

		response = await pvsProxy.proofCommand({ cmd: '(skosimp*)' });
		expect(response.result).not.to.be.undefined;
		expect(response.error).to.be.undefined;	
	});

	it(`can handle unicode characters`, async () => {
        await quitProverIfActive();

        const formula: PvsFormula = {
            contextFolder: helloworldExamples,
            fileExtension: ".pvs",
            fileName: "dummy",
            theoryName: "dummy",
            formulaName: "withUnicode"
        };

        let response: PvsResponse = await pvsProxy.proveFormula(formula);
		// console.log(response);
		response = await pvsProxy.proofCommand({ cmd: '(expand "≥")'});
		// console.dir(response.result);

		expect(response.error).to.be.undefined;
		expect(response.result).not.to.be.undefined;

		await quitProverIfActive();
    });

	//----- the tests below this line are completed successfully
	it(`can start prover session`, async () => {
		await quitProverIfActive();

		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "alaris_th"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.log(response);
		expect(response.result).not.to.be.undefined;
		expect(response.error).to.be.undefined;

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		// console.dir(response);
		expect(response.result).not.to.be.undefined;
		expect(response.error).to.be.undefined;
	}).timeout(60000);

	it(`can start interactive proof session when the formula has already been proved`, async () => {
		await quitProverIfActive();
		
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq"
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result[0].label).to.deep.equal(test.sq_neg_prove_formula.label);
		expect(response.result[0].sequent.succedents).not.to.be.undefined;

		try {
			// send proof command (skosimp*)
			response = await pvsProxy.proofCommand({ cmd: '(skosimp*)'});
			// console.dir(response);
			expect(response.result[0].sequent).not.to.be.undefined;
			expect(response.result[0]["prev-cmd"]).to.deep.equal("(skosimp*)");

			// send proof command (expand "sq")
			response = await pvsProxy.proofCommand({ cmd: '(expand "sq")'});
			// console.dir(response);
			expect(response.result[0].sequent).not.to.be.undefined;
			expect(response.result[0]["prev-cmd"]).to.deep.equal('(expand "sq")');

			// send proof command (assert) to complete the proof
			response = await pvsProxy.proofCommand({ cmd: '(assert)'});
			// console.dir(response);
			expect(response.result[0].commentary).to.contain('This completes the proof of sq_neg.');
			expect(response.result[1].commentary).to.contain('Q.E.D.');

			// try to re-start the proof
			response = await pvsProxy.proveFormula(desc);
			// console.dir(response);
			expect(response.result[0].label).to.deep.equal(test.sq_neg_prove_formula.label);
			expect(response.result[0].sequent).not.to.be.undefined;

			// send proof command (skosimp*)
			response = await pvsProxy.proofCommand({ cmd: '(skosimp*)'});
			// console.dir(response);
			expect(response.result[0].sequent).not.to.be.undefined;
		}
		finally {
			// quit the proof attempt
			await pvsProxy.proofCommand({ cmd: 'quit'});
		}

	}).timeout(4000);
	
	it(`can start a prover session and quit the prover session`, async () => {
		await quitProverIfActive();
		
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result[0].sequent).not.to.be.undefined;;

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		// console.dir(response);
		expect(response.result[0].commentary).to.contain('Proof attempt aborted');
	}).timeout(20000);
	
	it(`returns proverStatus = inactive when a prover session is not active`, async () => {
		const proverStatus: PvsResponse = await pvsProxy.getProverStatus();
		expect(proverStatus.result).to.deep.equal("inactive");
	}).timeout(4000);

	it(`returns proverStatus = active when a prover session is active`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_times",
			theoryName: "sq"
		};

		// start prover session
		await pvsProxy.proveFormula(desc);
		// check prover status
		const proverStatus: PvsResponse = await pvsProxy.getProverStatus();
		expect(proverStatus.result).to.deep.equal("active");

		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	}).timeout(4000);

	it(`can invoke prove-formula on theories with parameters`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "alaris_th" // pump_th exists, but check_chev_fup_permission is in alaris_th
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result).not.to.be.undefined;
		expect(response.error).to.be.undefined;

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		const proverStatus: PvsResult = await pvsProxy.getProverStatus();
		expect(proverStatus.result).not.to.be.undefined;
		expect(proverStatus.error).to.be.undefined;
		expect(proverStatus.result).to.deep.equal("inactive");
	}).timeout(60000);	

	it(`returns proverStatus = inactive after quitting a prover session`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_times",
			theoryName: "sq"
		};

		// start prover session
		await pvsProxy.proveFormula(desc);
		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
		// check prover status
		const proverStatus: PvsResponse = await pvsProxy.getProverStatus();
		expect(proverStatus.result).to.deep.equal("inactive");
	}).timeout(4000);

	it(`can start prover sessions in theories with parameters`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes.pump",
			formulaName: "vtbi_over_rate_lemma",
			theoryName: "pump_th"
		};
		// await pvsProxy.typecheckFile(desc); // typechecking, if needed, should be performed automatically by prove-formula
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).not.to.be.undefined;

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		const proverStatus: PvsResult = await pvsProxy.getProverStatus();
		expect(proverStatus.result).not.to.be.undefined;
		expect(proverStatus.error).to.be.undefined;
		expect(proverStatus.result).to.deep.equal("inactive");
	}).timeout(10000);

	it(`reports typecheck error when the prove command is executed but the theory does not typecheck`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "merge_size",
			theoryName: "mergesort_1"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).to.be.undefined;
		expect(response.error).not.to.be.undefined;
	}).timeout(10000);

	// the rationale for the following test case is to check that the following use case:
	// the user has defined formula l in file f1, and another formula with the same name l in file f2;
	// f1 typechecks correctly; f2 does not typecheck; the user tries to prove formula l in f2;
	// pvs-server should not start the proof and return a typecheck error
	it(`is able to distinguish theories with the same name that are stored in different files in the same context`, async () => {
		await quitProverIfActive();
		// this version of the theory does not typecheck, so the prover should report error
		let desc: PvsFormula = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "merge_size",
			theoryName: "mergesort"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).to.be.undefined;
		expect(response.error).not.to.be.undefined;
		// the following command should have no effect
		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		expect(response.result[0].commentary[0]).to.deep.equal("No change on: quit");
		expect(response.error).not.to.be.undefined;

		// this other version of the theory, on the other hand, typechecks correctly
		// pvs should report a typecheck error because two theories with the same name are in the same context folder
		desc = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort",
			formulaName: "merge_size",
			theoryName: "mergesort"
		};
		response = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result).to.be.undefined;
		expect(response.error).not.to.be.undefined;
		expect(response.error.data.error_string).to.contain("has been declared previously");
	}).timeout(10000);

	it(`reports error when trying to prove a theory that does not exist`, async () => {
		await quitProverIfActive();
		let desc: PvsFormula = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "merge_size",
			theoryName: "mergesort_2"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).to.be.undefined;
		expect(response.error).not.to.be.undefined;
	}).timeout(10000);

	it(`reports error when the prove command is executed but the formula does not exist`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: radixExamples,
			fileExtension: ".pvs",
			fileName: "mergesort-test",
			formulaName: "mm",
			theoryName: "mergesort_1"
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).to.be.undefined;
		expect(response.error).not.to.be.undefined;
	}).timeout(10000);

	it(`is robust to mistyped / malformed prover commands`, async () => {
		await quitProverIfActive();
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq"
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result[0].label).to.deep.equal(test.sq_neg_prove_formula.label);
		expect(response.result[0].sequent).not.to.be.undefined;

		// send proof command (skosimp*)
		response = await pvsProxy.proofCommand({ cmd: '(sko)'});
		// console.dir(response);
		expect(response.result[0].commentary).not.to.be.undefined;
		expect(response.result[0].commentary[0].endsWith("not a valid prover command")).to.equal(true);

		response = await pvsProxy.proofCommand({ cmd: '(sko'});
		// console.dir(response);
		expect(response.result[0].commentary).not.to.be.undefined;
		// console.dir(response.result[0].commentary);
		expect(response.result[0].commentary[0]).to.contain("No change on: (sko");

		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	});

	// // the following test is disabled because pvs does not support parallel processing of files
	// xit(`can start prover session while parsing files in other contexts`, async () => {
	// 	// async call to the parser in context safesandbox
	// 	pvsProxy.parseFile({ fileName: "alaris2lnewmodes", fileExtension: ".pvs", contextFolder: safeSandboxExamples });

	// 	// call to prove-formula in sandbox, while the parser is running in the other context
	// 	const desc: PvsFormula = {
	// 		contextFolder: sandboxExamples,
	// 		fileExtension: ".pvs",
	// 		fileName: "alaris2lnewmodes.pump",
	// 		formulaName: "vtbi_over_rate_lemma",
	// 		theoryName: "pump_th"
	// 	};
	// 	let response: PvsResponse = await pvsProxy.proveFormula(desc);
	// 	expect(response.result).not.to.be.undefined;
	// 	expect(response.error).to.be.undefined;

	// 	response = await pvsProxy.proofCommand({ cmd: 'quit' });
	// 	expect(response.result).toEqual({ result: 'Unfinished' });
	// }, 60000);

	//-----------------------------------------------
	//--- the following test fail on Mac and Linux
	//-----------------------------------------------

	// the following test fails after QED, with the following error
	// 	Error: the assertion
	//        (or (equalp (car scr-old) "")
	//            (and (stringp (car scr-old))
	//                 (char= (char (car scr-old) 0) #\;)))
	//        failed.
	//   [condition type: simple-error]
	it(`supports glassbox tactics`, async () => {
		await quitProverIfActive();

		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq"
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result[0].label).to.deep.equal(test.sq_neg_prove_formula.label);
		expect(response.result[0].sequent).not.to.be.undefined;

		response = await pvsProxy.proofCommand({ cmd: '(then (skosimp*)(grind))'});
		expect(response.error).to.be.undefined;
		expect(response.result).not.to.be.undefined;
		// console.dir(response);

		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	});

	// on Mac and Linux, the following test fails when executed **during the first** prover session
	// to activate the test case, change 'xit(...)' to 'it(...)'
	it(`is robust to prover commands with incorrect arguments`, async () => {
		await quitProverIfActive();

		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "sq",
			formulaName: "sq_neg",
			theoryName: "sq"
		};

		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		// console.dir(response);
		expect(response.result[0].label).to.deep.equal(test.sq_neg_prove_formula.label);
		expect(response.result[0].sequent).not.to.be.undefined;

		await pvsProxy.proofCommand({ cmd: '(skosimp*)'});
		response = await pvsProxy.proofCommand({ cmd: '(typepred "a!1)'});
		expect(response.error).to.be.undefined; // the prover reports error in the commentary
		expect(response.result[0].commentary).not.to.be.undefined;
		// console.dir(response.result);

		response = await pvsProxy.proofCommand({ cmd: '(expand "as <")'});
		expect(response.error).to.be.undefined; // the prover reports error in the commentary
		expect(response.result[0].commentary).not.to.be.undefined;
		// console.dir(response.result);

		// quit the proof attempt
		await pvsProxy.proofCommand({ cmd: 'quit'});
	});

	// on Mac and Linux, pvs-server fails with the following error:  { code: 1, message: '"No methods applicable for generic function #<standard-generic-function all-declarations> with args (nil) of classes (null)"' }
	// to activate the test case, change 'xit(...)' to 'it(...)'
	it(`prove-formula is robust to invocations with incorrect theory names`, async () => {
		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "pump_th" // pump_th exists, but check_chev_fup_permission is in alaris_th
		};
		let response: PvsResponse = await pvsProxy.proveFormula(desc);
		expect(response.result).to.be.undefined;
		expect(response.error).not.to.be.undefined;
		expect(response.error.message.startsWith("Typecheck-error")).to.equal(true);

		response = await pvsProxy.proofCommand({ cmd: 'quit' });
		//console.dir(response);
		expect(response.result[0].commentary[0]).to.contain("No change on: quit");
		expect(response.error).not.to.be.undefined;
		expect(response.error.message).to.contain('Proof-command error');
	}).timeout(60000);

	it(`can interrupt prover commands`, async () => {
		await quitProverIfActive();

		const desc: PvsFormula = {
			contextFolder: sandboxExamples,
			fileExtension: ".pvs",
			fileName: "alaris2lnewmodes",
			formulaName: "check_chev_fup_permission",
			theoryName: "alaris_th"
		};
		await pvsProxy.proveFormula(desc);

		setTimeout(async () => {
			pvsProxy.pvsRequest("interrupt");
		}, 2000);
		await pvsProxy.proofCommand({ cmd: '(skosimp*)' });
		let response: PvsResponse = await pvsProxy.proofCommand({ cmd: '(grind)' });

		expect(response.result).not.to.be.undefined;
		expect(response.result[0].label).not.to.be.undefined;
		expect(response.result[0].sequent).not.to.be.undefined;
		expect(response.result[0]["prev-cmd"]).to.deep.equal("(skosimp*)");
		// console.dir(response.result);
	}).timeout(20000);

	it(`interrupt has no effect when the prover is not executing a command`, async () => {
        await quitProverIfActive();

        const formula: PvsFormula = {
            contextFolder: helloworldExamples,
            fileExtension: ".pvs",
            fileName: "helloworld",
            theoryName: "helloworld",
            formulaName: "always_positive"
        };

        let response: PvsResponse = await pvsProxy.proveFormula(formula);
        // console.dir(response);
        response = await pvsProxy.pvsRequest('interrupt');
		// console.dir(response);
		response = await pvsProxy.proofCommand({ cmd: "(skosimp*)" });
		// console.dir(response);

		expect(response.error).to.be.undefined;
		expect(response.result).not.to.be.undefined;

		await quitProverIfActive();
    });

	// this test fails no MacOS -- a fix is not available at the moment, to be resolved in the next release of pvs
	xit(`can prove omega_2D_continuous without triggering stack overflow`, async () => {
        await quitProverIfActive();

        const formula: PvsFormula = {
            contextFolder: path.join(__dirname, "nasalib/ACCoRD"),
            fileExtension: ".pvs",
            fileName: "omega_2D",
            theoryName: "omega_2D",
            formulaName: "omega_2D_continuous"
        };

        let response: PvsResponse = await pvsProxy.proveFormula(formula);
		// console.dir(response);
		const cmds: string[] = [
			`(skosimp*)`,
			`(lemma "curried_min_is_cont_2D")`,
			`(inst - "(LAMBDA (t: real, v: Vect2): IF (B <= t AND t <= T) THEN horiz_dist_scaf(s!1)(t,v) ELSE 0 ENDIF)" "B" "T")`,
			`(ground)`,
			`(expand "continuous?")`,
			`(expand "continuous?")`,
			`(expand "continuous_at?")`,
			`(skosimp*)`,
			`(inst - "x!1")`,
			`(inst - "epsilon!1")`,
			`(skosimp*)`,
			`(inst + "delta!1")`,
			`(skosimp*)`,
			`(inst - "y!1")`,
			`(expand "member")`,
			`(expand "ball")`,
			`(lemma "omega_2D_min_rew")`,
			`(inst-cp - "s!1" "x!1")`,
			`(inst - "s!1" "y!1")`,
			`(assert)`,
			`(case "{r: real | EXISTS (t: Lookahead): horiz_dist_scaf(s!1)(t, y!1) = r} = {r: real | EXISTS (t_1: (LAMBDA (x: real): B <= x AND x <= T)): r = horiz_dist_scaf(s!1)(t_1, y!1)} AND {r: real | EXISTS (t: Lookahead): horiz_dist_scaf(s!1)(t, x!1) = r} = {r: real | EXISTS (t_1: (LAMBDA (x: real): B <= x AND x <= T)): r = horiz_dist_scaf(s!1)(t_1, x!1)}")`,
			`(flatten)`,
			`(assert)`
		]
		for (let i = 0; i < cmds.length; i++) {
			response = await pvsProxy.proofCommand({ cmd: cmds[i] });
		}
		console.dir(response);
		expect(response.error).to.be.undefined;
		expect(response.result).not.to.be.undefined;

	}).timeout(80000);
	

	// this test fails no MacOS -- a fix is not available at the moment, to be resolved in the next release of pvs
	xit(`stuck thread`, async () => {
        await quitProverIfActive();

        const formula: PvsFormula = {
            contextFolder: path.join(__dirname, "helloworld"),
            fileExtension: ".pvs",
            fileName: "helloworld",
            theoryName: "helloworld",
            formulaName: "foo"
        };

        let response: PvsResponse = await pvsProxy.proveFormula(formula);
        // console.dir(response);
        response = await pvsProxy.proofCommand({ cmd: "(assert)" });
		// console.dir(response);
		await new Promise<void>((resolve, reject) => {
			setTimeout(() => {
				let info: string = execSync("ps -o pcpu").toLocaleString();
				const cpus: number[] = info.split("\n").slice(1).map(line => {
					return +line;
				});
				for (let i = 0; i < cpus.length; i++) {
					console.dir(`cpu[${i}] = ${cpus[i]}%`);
					expect(cpus[i]).to.be.lt(50);
				}
				resolve();
			}, 16000);
		});
    }).timeout(20000);
});
